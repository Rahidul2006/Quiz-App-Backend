import mongoose from "mongoose";
import { JudgingTeam, IJudgingTeam } from "../models/JudgingTeam";

export interface CodecraftMemberDetail {
  name: string;
  email: string;
  phone?: string;
  college?: string;
  branch?: string;
  year?: string;
  isLeader?: boolean;
  status?: string;
}

export interface CodecraftTeamData {
  teamName: string;
  teamCode: string;
  projectName: string;
  members: string;
  memberCount: number;
  memberDetails: CodecraftMemberDetail[];
  projectDetails?: {
    projectName?: string;
    projectTheme?: string;
    projectDescription?: string;
    repoLink?: string;
    demoLink?: string;
  };
}

const DEFAULT_CODECRAFT_URI =
  "mongodb+srv://codecraft:xCJ3Fger2jw6vDsX@cluster0.66pfalv.mongodb.net/?appName=Cluster0";

let codecraftConnection: mongoose.Connection | null = null;

/**
 * Returns a cached, strictly read-only Mongoose connection to the external CodeCraft MongoDB cluster.
 * NO writes, updates, deletes, or mutations are ever executed through this connection.
 */
export const getCodecraftReadOnlyConnection = async (): Promise<mongoose.Connection> => {
  if (codecraftConnection && codecraftConnection.readyState === 1) {
    return codecraftConnection;
  }

  const uri = process.env.CODECRAFT_MONGODB_URI || DEFAULT_CODECRAFT_URI;

  codecraftConnection = await mongoose.createConnection(uri, {
    dbName: "codecraft",
    readPreference: "secondaryPreferred",
  }).asPromise();

  console.log("[CodecraftService] Connected to remote CodeCraft MongoDB in READ-ONLY mode.");
  return codecraftConnection;
};

/**
 * Fetches all team data from the external CodeCraft MongoDB URI in READ-ONLY mode.
 * Strictly performs read queries (find, toArray) on the remote database.
 */
export const fetchCodecraftTeams = async (): Promise<CodecraftTeamData[]> => {
  const conn = await getCodecraftReadOnlyConnection();

  const regCol = conn.collection("registrations");
  const invCol = conn.collection("invitations");
  const userCol = conn.collection("users");
  const hackCol = conn.collection("hackathons");

  // Read-only queries
  const [regs, invs, users, hacks] = await Promise.all([
    regCol.find({}).toArray(),
    invCol.find({}).toArray(),
    userCol.find({}).toArray(),
    hackCol.find({}).toArray(),
  ]);

  const defaultHackTitle = hacks.length > 0 && hacks[0].title ? hacks[0].title : "CodeCraft 2k26";

  const normalize = (s: any): string => (typeof s === "string" ? s.trim() : "");

  // Email to Registration & User maps
  const emailToReg = new Map<string, any>();
  regs.forEach((r) => {
    const email = normalize(r.responses?.phase_1_registration?.email).toLowerCase();
    if (email) emailToReg.set(email, r);
  });

  const emailToUser = new Map<string, any>();
  users.forEach((u) => {
    const email = normalize(u.email).toLowerCase();
    if (email) emailToUser.set(email, u);
  });

  // Team aggregation map (keyed by lowercase normalized team name)
  const teamMap = new Map<
    string,
    {
      teamName: string;
      members: Map<string, CodecraftMemberDetail>;
      projectName: string;
      projectDetails: {
        projectName?: string;
        projectTheme?: string;
        projectDescription?: string;
        repoLink?: string;
        demoLink?: string;
      };
    }
  >();

  const getOrCreateTeam = (rawName: string) => {
    const teamName = normalize(rawName);
    if (!teamName) return null;
    const key = teamName.toLowerCase();
    if (!teamMap.has(key)) {
      teamMap.set(key, {
        teamName,
        members: new Map<string, CodecraftMemberDetail>(),
        projectName: `${defaultHackTitle} Project`,
        projectDetails: {},
      });
    }
    return teamMap.get(key)!;
  };

  // 1. Process registrations
  regs.forEach((r) => {
    const p1 = r.responses?.phase_1_registration || {};
    const p2 = r.responses?.phase_2_team_formation || {};
    const p3 = r.responses?.phase_3_submissions || {};

    const rawTeamName = p2.teamName || r.teamName;
    if (!rawTeamName) return;

    const team = getOrCreateTeam(rawTeamName);
    if (!team) return;

    const email = normalize(p1.email).toLowerCase();
    const name = normalize(p1.name) || email || "Team Member";

    if (email && !team.members.has(email)) {
      team.members.set(email, {
        name,
        email,
        phone: normalize(p1.phone),
        college: normalize(p1.collegeName),
        branch: normalize(p1.branch),
        year: normalize(p1.year),
        isLeader: true,
      });
    }

    // Capture project submission details if available
    if (p3.projectName) {
      team.projectName = normalize(p3.projectName);
      team.projectDetails.projectName = normalize(p3.projectName);
    }
    if (p3.field_1788582223576_b4erkgfpb) {
      team.projectDetails.projectTheme = normalize(p3.field_1788582223576_b4erkgfpb);
    }
    if (p3.projectDescription) {
      team.projectDetails.projectDescription = normalize(p3.projectDescription);
    }
    if (p3.repoLink) {
      team.projectDetails.repoLink = normalize(p3.repoLink);
    }
    if (p3.demoLink) {
      team.projectDetails.demoLink = normalize(p3.demoLink);
    }
  });

  // 2. Process invitations
  invs.forEach((inv) => {
    const rawTeamName = inv.teamName;
    if (!rawTeamName) return;

    const team = getOrCreateTeam(rawTeamName);
    if (!team) return;

    // Leader (inviter)
    const inviterEmail = normalize(inv.inviterEmail).toLowerCase();
    if (inviterEmail && !team.members.has(inviterEmail)) {
      const reg = emailToReg.get(inviterEmail);
      const user = emailToUser.get(inviterEmail);
      const p1 = reg?.responses?.phase_1_registration;
      const name = p1?.name || user?.name || inviterEmail;

      team.members.set(inviterEmail, {
        name: normalize(name),
        email: inviterEmail,
        phone: normalize(p1?.phone || user?.phone),
        college: normalize(p1?.collegeName || user?.collegeName),
        branch: normalize(p1?.branch || user?.branch),
        year: normalize(p1?.year || user?.year),
        isLeader: true,
      });
    }

    // Teammate (invitee)
    const inviteeEmail = normalize(inv.inviteeEmail).toLowerCase();
    const isAccepted = normalize(inv.status).toLowerCase() === "accepted";

    if (inviteeEmail && isAccepted && !team.members.has(inviteeEmail)) {
      const reg = emailToReg.get(inviteeEmail);
      const user = emailToUser.get(inviteeEmail);
      const p1 = reg?.responses?.phase_1_registration;
      const name = inv.inviteeName || p1?.name || user?.name || inviteeEmail;

      team.members.set(inviteeEmail, {
        name: normalize(name),
        email: inviteeEmail,
        phone: normalize(p1?.phone || user?.phone),
        college: normalize(p1?.collegeName || user?.collegeName),
        branch: normalize(p1?.branch || user?.branch),
        year: normalize(p1?.year || user?.year),
        isLeader: false,
        status: "accepted",
      });
    }
  });

  // Format into final list
  const teamList: CodecraftTeamData[] = [];
  let index = 1;

  for (const [, entry] of teamMap.entries()) {
    const membersArr = Array.from(entry.members.values());

    // Format readable members string
    const membersFormatted = membersArr
      .map((m) => `${m.name}${m.email ? ` (${m.email})` : ""}`)
      .join(", ");

    teamList.push({
      teamName: entry.teamName,
      teamCode: `CC-${String(index).padStart(3, "0")}`,
      projectName: entry.projectName,
      members: membersFormatted,
      memberCount: membersArr.length,
      memberDetails: membersArr,
      projectDetails: entry.projectDetails,
    });

    index++;
  }

  return teamList;
};

/**
 * Synchronizes CodeCraft teams into the specified judging round in Quiz_App's database.
 * Does NOT write anything to the external CodeCraft DB.
 * Safely updates or creates teams in Quiz_App's local store.
 */
export const syncCodecraftTeamsToRound = async (
  roundId: string
): Promise<{ syncedCount: number; createdCount: number; updatedCount: number; teams: IJudgingTeam[] }> => {
  const codecraftTeams = await fetchCodecraftTeams();

  const existingTeams = await JudgingTeam.find({ roundId });
  let createdCount = 0;
  let updatedCount = 0;

  for (const cTeam of codecraftTeams) {
    const match = existingTeams.find(
      (et) => et.teamName.trim().toLowerCase() === cTeam.teamName.trim().toLowerCase()
    );

    if (match) {
      // Update details while keeping existing teamCode and ID (preserves evaluations)
      match.projectName = cTeam.projectName || match.projectName;
      if (cTeam.members) {
        match.members = cTeam.members;
      }
      await match.save();
      updatedCount++;
    } else {
      // Create new team entry for this round
      const orderIndex = existingTeams.length + createdCount;
      const teamCode = `CC-${String(orderIndex + 1).padStart(3, "0")}`;

      const created = await JudgingTeam.create({
        roundId,
        teamCode,
        teamName: cTeam.teamName,
        projectName: cTeam.projectName,
        members: cTeam.members,
        orderIndex,
      });
      existingTeams.push(created);
      createdCount++;
    }
  }

  const finalTeams = await JudgingTeam.find({ roundId }).sort({ orderIndex: 1, teamCode: 1 });

  return {
    syncedCount: codecraftTeams.length,
    createdCount,
    updatedCount,
    teams: finalTeams,
  };
};
