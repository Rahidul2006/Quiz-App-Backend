import mongoose from "mongoose";
import { JudgingTeam, IJudgingTeam } from "../models/JudgingTeam";

export interface ExternalTeamMember {
  name: string;
  email?: string;
  phone?: string;
  college?: string;
  branch?: string;
  year?: string;
  isLeader?: boolean;
}

export interface ExternalTeamData {
  teamName: string;
  projectName: string;
  members: string;           // Formatted string for display
  memberCount: number;
  memberDetails: ExternalTeamMember[];
  rawData?: Record<string, any>; // Original raw document for reference
}

// Connection pool (keyed by URI + DB) — no persistent cache across requests
const connectionPool = new Map<string, mongoose.Connection>();

/**
 * Extracts database name from a MongoDB connection string (URI).
 * Examples:
 *   mongodb+srv://user:pass@cluster.mongodb.net/codecraft?appName=Cluster0 -> "codecraft"
 *   mongodb://localhost:27017/my_db -> "my_db"
 *   mongodb+srv://user:pass@cluster.mongodb.net/?appName=Cluster0 -> null
 */
export const extractDbNameFromUri = (uri: string): string | null => {
  try {
    const match = uri.match(/^mongodb(?:\+srv)?:\/\/[^/]+\/([^?/\s]+)/i);
    if (match && match[1]) {
      const db = decodeURIComponent(match[1]).trim();
      if (db) return db;
    }
  } catch {
    // fallback
  }
  return null;
};

/**
 * Database selection priority:
 * 1. Explicit dbName parameter if provided
 * 2. Database name parsed from the MongoDB URI
 * 3. Throw a clear error if neither exists
 */
export const resolveDatabaseName = (uri: string, dbName?: string): string => {
  if (dbName && dbName.trim()) {
    return dbName.trim();
  }
  const fromUri = extractDbNameFromUri(uri);
  if (fromUri && fromUri.trim()) {
    return fromUri.trim();
  }
  throw new Error("Database name is required. Enter the database name or include it in the MongoDB URI.");
};

/**
 * Creates a fresh read-only connection to any external MongoDB URI targeting the resolved database.
 * Caches by URI + DB to avoid duplicate connections within the same server session.
 */
export const getExternalConnection = async (
  uri: string,
  resolvedDbName: string
): Promise<mongoose.Connection> => {
  const cacheKey = `${uri}|${resolvedDbName}`;

  // Return cached if still connected
  const cached = connectionPool.get(cacheKey);
  if (cached && cached.readyState === 1) {
    return cached;
  }

  const connOptions: mongoose.ConnectOptions = {
    serverSelectionTimeoutMS: 8000,
    connectTimeoutMS: 8000,
    dbName: resolvedDbName,
  };

  const conn = await mongoose
    .createConnection(uri, {
      ...connOptions,
      readPreference: "secondaryPreferred",
    })
    .asPromise();

  connectionPool.set(cacheKey, conn);
  return conn;
};

/**
 * Closes and removes a connection from the pool.
 */
export const closeExternalConnection = async (uri: string, dbName?: string): Promise<void> => {
  const cacheKey = `${uri}|${dbName || ""}`;
  const conn = connectionPool.get(cacheKey);
  if (conn) {
    await conn.close();
    connectionPool.delete(cacheKey);
  }
};

/**
 * Lists all collection names in the resolved external MongoDB database.
 * Returns both the resolved database name and the sorted collection list.
 */
export const listExternalCollections = async (
  uri: string,
  dbName?: string
): Promise<{ resolvedDbName: string; collections: string[] }> => {
  const resolvedDbName = resolveDatabaseName(uri, dbName);
  const conn = await getExternalConnection(uri, resolvedDbName);

  // Explicitly query the resolved database from the native MongoClient
  const targetDb = conn.getClient().db(resolvedDbName);
  const collectionsList = await targetDb.listCollections().toArray();
  const collections = (collectionsList || []).map((c: any) => c.name).sort();

  if (process.env.NODE_ENV !== "production") {
    console.log(`[ExternalDB] Resolved database: "${resolvedDbName}" | Found ${collections.length} collection(s)`);
  }

  return { resolvedDbName, collections };
};

/**
 * Fetches raw documents from a collection (limited for preview).
 */
export const previewCollectionDocuments = async (
  uri: string,
  dbName: string | undefined,
  collectionName: string,
  limit: number = 100
): Promise<Record<string, any>[]> => {
  const resolvedDb = resolveDatabaseName(uri, dbName);
  const conn = await getExternalConnection(uri, resolvedDb);
  const targetDb = conn.getClient().db(resolvedDb);
  const col = targetDb.collection(collectionName);
  return await col.find({}).limit(limit).toArray();
};

/**
 * Auto-detects a "team name" field from a sample document.
 * Looks for common field names used in hackathon registration systems.
 */
export const detectTeamNameField = (doc: Record<string, any>): string | null => {
  const candidates = [
    "teamName", "team_name", "name", "team", "groupName", "group_name",
    "projectTeam", "hackathonTeam",
  ];
  for (const c of candidates) {
    if (typeof doc[c] === "string" && doc[c].trim()) return c;
    // nested check: responses.phase_2_team_formation.teamName
    if (doc.responses?.phase_2_team_formation?.[c]) return `responses.phase_2_team_formation.${c}`;
  }
  return null;
};

/**
 * Auto-detects a "project name" field from a sample document.
 */
export const detectProjectField = (doc: Record<string, any>): string | null => {
  const candidates = [
    "projectName", "project_name", "project", "hackathonProject",
  ];
  for (const c of candidates) {
    if (typeof doc[c] === "string" && doc[c].trim()) return c;
    if (doc.responses?.phase_3_submissions?.[c]) return `responses.phase_3_submissions.${c}`;
  }
  return null;
};

/**
 * Safely reads a nested field using dot notation from a document.
 */
const getNestedField = (doc: Record<string, any>, path: string): any => {
  const parts = path.split(".");
  let val: any = doc;
  for (const p of parts) {
    if (val == null) return undefined;
    val = val[p];
  }
  return val;
};

/**
 * Normalizes a value to string.
 */
const norm = (v: any): string => (typeof v === "string" ? v.trim() : "");

/**
 * Converts a raw collection document into a team preview using auto-detected or admin-specified fields.
 * Works for any MongoDB schema by best-effort field mapping.
 */
export const documentToTeamData = (
  doc: Record<string, any>,
  options: {
    teamNameField?: string;
    projectField?: string;
    membersField?: string;
  } = {}
): ExternalTeamData | null => {
  const teamNameField = options.teamNameField || detectTeamNameField(doc);
  const projectField = options.projectField || detectProjectField(doc);

  // Extract team name
  let teamName = "";
  if (teamNameField) {
    teamName = norm(getNestedField(doc, teamNameField));
  }
  if (!teamName) {
    // Last resort: try to find any string field with "team" in the key
    for (const [k, v] of Object.entries(doc)) {
      if (k.toLowerCase().includes("team") && typeof v === "string" && v.trim()) {
        teamName = v.trim();
        break;
      }
    }
  }
  if (!teamName) return null;

  // Extract project name
  let projectName = "";
  if (projectField) {
    projectName = norm(getNestedField(doc, projectField));
  }
  if (!projectName) projectName = `${teamName} Project`;

  // Extract members
  let memberDetails: ExternalTeamMember[] = [];
  if (options.membersField) {
    const raw = getNestedField(doc, options.membersField);
    if (Array.isArray(raw)) {
      memberDetails = raw.map((m: any) => ({
        name: norm(m.name || m.fullName || m.memberName || ""),
        email: norm(m.email || ""),
        phone: norm(m.phone || m.mobile || ""),
        college: norm(m.college || m.collegeName || m.institution || ""),
        branch: norm(m.branch || m.department || ""),
        year: norm(m.year || m.yearOfStudy || ""),
        isLeader: Boolean(m.isLeader || m.leader),
      }));
    } else if (typeof raw === "string" && raw.trim()) {
      memberDetails = [{ name: raw.trim() }];
    }
  }

  // If no members extracted, try to find a member in the registration phase
  if (memberDetails.length === 0) {
    const p1 = doc.responses?.phase_1_registration;
    if (p1) {
      const name = norm(p1.name || p1.fullName || "");
      const email = norm(p1.email || "");
      if (name || email) {
        memberDetails.push({
          name: name || email,
          email,
          phone: norm(p1.phone || ""),
          college: norm(p1.collegeName || p1.college || ""),
          branch: norm(p1.branch || ""),
          year: norm(p1.year || ""),
          isLeader: true,
        });
      }
    }
  }

  // If still no members but the doc itself looks like a member
  if (memberDetails.length === 0) {
    const name = norm(doc.name || doc.fullName || doc.memberName || "");
    const email = norm(doc.email || "");
    if (name || email) {
      memberDetails.push({ name: name || email, email });
    }
  }

  const membersFormatted = memberDetails
    .map((m) => `${m.name}${m.email ? ` (${m.email})` : ""}`)
    .join(", ");

  return {
    teamName,
    projectName,
    members: membersFormatted,
    memberCount: memberDetails.length,
    memberDetails,
    rawData: doc,
  };
};

/**
 * Fetches and converts an entire collection to a team list (limited to 200 docs).
 */
export const fetchTeamsFromCollection = async (
  uri: string,
  dbName: string | undefined,
  collectionName: string,
  options: {
    teamNameField?: string;
    projectField?: string;
    membersField?: string;
    limit?: number;
  } = {}
): Promise<ExternalTeamData[]> => {
  const docs = await previewCollectionDocuments(uri, dbName, collectionName, options.limit || 200);

  const teams: ExternalTeamData[] = [];
  // Deduplicate by team name (case-insensitive)
  const seen = new Set<string>();

  for (const doc of docs) {
    const team = documentToTeamData(doc, options);
    if (!team) continue;
    const key = team.teamName.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      teams.push(team);
    }
  }

  return teams;
};

/**
 * Imports a single team from external data into a judging round.
 * Skips silently if a team with the same name already exists.
 */
export const importSingleTeamToRound = async (
  roundId: string,
  teamData: ExternalTeamData,
  teamCodePrefix: string = "EXT"
): Promise<IJudgingTeam> => {
  // Check if team already exists by name
  const existing = await JudgingTeam.findOne({
    roundId,
    teamName: { $regex: new RegExp(`^${teamData.teamName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
  });

  if (existing) {
    // Update project name and members if provided
    if (teamData.projectName) existing.projectName = teamData.projectName;
    if (teamData.members) existing.members = teamData.members;
    await existing.save();
    return existing;
  }

  // Get current count for ordering and code generation
  const count = await JudgingTeam.countDocuments({ roundId });
  const teamCode = `${teamCodePrefix}-${String(count + 1).padStart(3, "0")}`;

  const created = await JudgingTeam.create({
    roundId,
    teamCode,
    teamName: teamData.teamName,
    projectName: teamData.projectName || `${teamData.teamName} Project`,
    members: teamData.members || "",
    orderIndex: count,
  });

  return created;
};
