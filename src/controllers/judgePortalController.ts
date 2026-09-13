import { Response } from "express";
import { JudgeAuthRequest } from "../middleware/judgeAuthMiddleware";
import { JudgingRound } from "../models/JudgingRound";
import { JudgingTeam } from "../models/JudgingTeam";
import { JudgingCriterion } from "../models/JudgingCriterion";
import { JudgeAssignment } from "../models/JudgeAssignment";
import { Evaluation } from "../models/Evaluation";

export const getAssignedTeams = async (req: JudgeAuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.judge) {
      res.status(401).json({ message: "Not authenticated as judge" });
      return;
    }

    const judgeId = req.judge.id;

    // The Admin-selected active round is the authoritative source of truth for the Judge Portal
    let round = await JudgingRound.findOne({ status: "active" });
    if (!round) {
      // Fallback if no round has been marked active yet
      round = await JudgingRound.findOne().sort({ createdAt: -1 });
    }

    if (!round) {
      res.json({
        round: null,
        teams: [],
        stats: { completed: 0, pending: 0, draft: 0, total: 0 },
      });
      return;
    }

    const roundId = round._id.toString();

    // Determine teams judge can evaluate
    let teams = [];
    if (round.evaluationMode === "all") {
      teams = await JudgingTeam.find({ roundId }).sort({ orderIndex: 1, teamCode: 1 });
    } else {
      const assignments = await JudgeAssignment.find({ roundId, judgeId });
      const teamIds = assignments.map((a) => a.teamId);
      teams = await JudgingTeam.find({ _id: { $in: teamIds } }).sort({ orderIndex: 1, teamCode: 1 });
    }

    // Fetch this judge's evaluations for these teams
    const evaluations = await Evaluation.find({ roundId, judgeId });

    let completedCount = 0;
    let draftCount = 0;

    const teamList = teams.map((team) => {
      const ev = evaluations.find((e) => e.teamId.toString() === team._id.toString());
      const status = ev ? ev.status : "PENDING";

      if (status === "SUBMITTED") completedCount++;
      else if (status === "DRAFT") draftCount++;

      return {
        id: team._id,
        _id: team._id,
        teamCode: team.teamCode,
        teamName: team.teamName,
        projectName: team.projectName,
        members: team.members,
        status,
        totalScore: ev && status === "SUBMITTED" ? ev.totalScore : null,
        draftScore: ev && status === "DRAFT" ? ev.totalScore : null,
      };
    });

    const pendingCount = Math.max(0, teamList.length - completedCount);

    res.json({
      round: {
        id: round._id,
        _id: round._id,
        name: round.name,
        status: round.status,
        isLocked: round.isLocked,
        evaluationMode: round.evaluationMode,
        allowJudgeEditAfterSubmit: round.allowJudgeEditAfterSubmit,
      },
      stats: {
        total: teamList.length,
        completed: completedCount,
        draft: draftCount,
        pending: pendingCount,
      },
      teams: teamList,
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to fetch assigned teams" });
  }
};

export const getTeamForEvaluation = async (req: JudgeAuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.judge) {
      res.status(401).json({ message: "Not authenticated as judge" });
      return;
    }

    const { teamId } = req.params;
    const judgeId = req.judge.id;

    const team = await JudgingTeam.findById(teamId);
    if (!team) {
      res.status(404).json({ message: "Team not found" });
      return;
    }

    const round = await JudgingRound.findById(team.roundId);
    if (!round) {
      res.status(404).json({ message: "Judging round not found" });
      return;
    }

    // Security check: verify judge is assigned to this team if mode is "assigned"
    if (round.evaluationMode === "assigned") {
      const assignment = await JudgeAssignment.findOne({
        roundId: team.roundId,
        judgeId,
        teamId,
      });

      if (!assignment) {
        res.status(403).json({
          message: "Forbidden: You are not assigned to evaluate this team.",
        });
        return;
      }
    }

    const criteria = await JudgingCriterion.find({ roundId: team.roundId }).sort({ orderIndex: 1 });
    const existingEval = await Evaluation.findOne({
      roundId: team.roundId,
      judgeId,
      teamId,
    });

    const totalMaxScore = criteria.reduce((sum, c) => sum + (c.maxScore || 0), 0);

    const isLocked = Boolean(
      round.isLocked ||
      (existingEval?.status === "SUBMITTED" && !round.allowJudgeEditAfterSubmit)
    );

    res.json({
      team: {
        id: team._id,
        _id: team._id,
        teamCode: team.teamCode,
        teamName: team.teamName,
        projectName: team.projectName,
        members: team.members,
      },
      round: {
        id: round._id,
        name: round.name,
        isLocked: round.isLocked,
        allowJudgeEditAfterSubmit: round.allowJudgeEditAfterSubmit,
        totalMaxScore,
      },
      criteria: criteria.map((c) => ({
        id: c._id,
        _id: c._id,
        name: c.name,
        maxScore: c.maxScore,
        description: c.description,
      })),
      evaluation: existingEval
        ? {
            status: existingEval.status,
            totalScore: existingEval.totalScore,
            comments: existingEval.comments,
            criteriaScores: existingEval.criteriaScores,
            submittedAt: existingEval.submittedAt,
          }
        : null,
      isLocked,
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to fetch evaluation screen" });
  }
};

export const saveDraftEvaluation = async (req: JudgeAuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.judge) {
      res.status(401).json({ message: "Not authenticated as judge" });
      return;
    }

    const { teamId } = req.params;
    const { criteriaScores, comments } = req.body;
    const judgeId = req.judge.id;

    const team = await JudgingTeam.findById(teamId);
    if (!team) {
      res.status(404).json({ message: "Team not found" });
      return;
    }

    const round = await JudgingRound.findById(team.roundId);
    if (!round) {
      res.status(404).json({ message: "Judging round not found" });
      return;
    }

    // Safety guard: Verify that the evaluated team's round is the currently active round
    const activeRound = await JudgingRound.findOne({ status: "active" });
    if (activeRound && activeRound._id.toString() !== team.roundId.toString()) {
      res.status(409).json({
        message: `This judging round is no longer active. The active round has been changed to "${activeRound.name}".`,
        activeRoundId: activeRound._id.toString(),
      });
      return;
    }

    if (round.isLocked) {
      res.status(403).json({ message: "Forbidden: Judging is locked by the administrator" });
      return;
    }

    // Assignment check
    if (round.evaluationMode === "assigned") {
      const assignment = await JudgeAssignment.findOne({
        roundId: team.roundId,
        judgeId,
        teamId,
      });
      if (!assignment) {
        res.status(403).json({ message: "Forbidden: You are not assigned to evaluate this team" });
        return;
      }
    }

    const criteria = await JudgingCriterion.find({ roundId: team.roundId });

    // Validate scores
    let calculatedTotal = 0;
    const validatedScores: { criterionId: any; score: number }[] = [];

    if (Array.isArray(criteriaScores)) {
      for (const item of criteriaScores) {
        const criterion = criteria.find(
          (c) => c._id.toString() === item.criterionId.toString()
        );

        if (!criterion) continue;

        const scoreNum = Number(item.score);
        if (isNaN(scoreNum) || scoreNum < 0) {
          res.status(400).json({
            message: `Score for '${criterion.name}' must be a non-negative number`,
          });
          return;
        }

        if (scoreNum > criterion.maxScore) {
          res.status(400).json({
            message: `Score for '${criterion.name}' cannot exceed maximum of ${criterion.maxScore}`,
          });
          return;
        }

        calculatedTotal += scoreNum;
        validatedScores.push({
          criterionId: criterion._id,
          score: scoreNum,
        });
      }
    }

    let evaluation = await Evaluation.findOne({
      roundId: team.roundId,
      judgeId,
      teamId,
    });

    if (evaluation) {
      if (evaluation.status === "SUBMITTED" && !round.allowJudgeEditAfterSubmit) {
        res.status(403).json({
          message: "Forbidden: Submitted evaluation cannot be modified without admin permission",
        });
        return;
      }

      evaluation.criteriaScores = validatedScores;
      evaluation.totalScore = calculatedTotal;
      evaluation.comments = comments ? comments.trim() : "";
      evaluation.status = "DRAFT";
      await evaluation.save();
    } else {
      evaluation = await Evaluation.create({
        roundId: team.roundId,
        judgeId,
        teamId,
        status: "DRAFT",
        criteriaScores: validatedScores,
        totalScore: calculatedTotal,
        comments: comments ? comments.trim() : "",
      });
    }

    res.json({
      message: "Evaluation draft saved successfully",
      evaluation: {
        status: evaluation.status,
        totalScore: evaluation.totalScore,
        comments: evaluation.comments,
        criteriaScores: evaluation.criteriaScores,
      },
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to save draft" });
  }
};

export const submitEvaluation = async (req: JudgeAuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.judge) {
      res.status(401).json({ message: "Not authenticated as judge" });
      return;
    }

    const { teamId } = req.params;
    const { criteriaScores, comments } = req.body;
    const judgeId = req.judge.id;

    const team = await JudgingTeam.findById(teamId);
    if (!team) {
      res.status(404).json({ message: "Team not found" });
      return;
    }

    const round = await JudgingRound.findById(team.roundId);
    if (!round) {
      res.status(404).json({ message: "Judging round not found" });
      return;
    }

    // Safety guard: Verify that the evaluated team's round is the currently active round
    const activeRound = await JudgingRound.findOne({ status: "active" });
    if (activeRound && activeRound._id.toString() !== team.roundId.toString()) {
      res.status(409).json({
        message: `This judging round is no longer active. The administrator switched the active round to "${activeRound.name}".`,
        activeRoundId: activeRound._id.toString(),
        activeRoundName: activeRound.name,
      });
      return;
    }

    if (round.isLocked) {
      res.status(403).json({ message: "Forbidden: Judging is locked by the administrator" });
      return;
    }

    // Assignment check
    if (round.evaluationMode === "assigned") {
      const assignment = await JudgeAssignment.findOne({
        roundId: team.roundId,
        judgeId,
        teamId,
      });
      if (!assignment) {
        res.status(403).json({ message: "Forbidden: You are not assigned to evaluate this team" });
        return;
      }
    }

    const criteria = await JudgingCriterion.find({ roundId: team.roundId });

    if (!Array.isArray(criteriaScores) || criteriaScores.length === 0) {
      res.status(400).json({ message: "Please provide scores for all criteria" });
      return;
    }

    // Validate that every criterion is scored and within bounds
    let calculatedTotal = 0;
    const validatedScores: { criterionId: any; score: number }[] = [];

    for (const criterion of criteria) {
      const item = criteriaScores.find(
        (cs: any) => cs.criterionId.toString() === criterion._id.toString()
      );

      if (!item || item.score === undefined || item.score === null || item.score === "") {
        res.status(400).json({ message: `Please enter a score for '${criterion.name}'` });
        return;
      }

      const scoreNum = Number(item.score);
      if (isNaN(scoreNum) || scoreNum < 0) {
        res.status(400).json({
          message: `Score for '${criterion.name}' must be a non-negative number`,
        });
        return;
      }

      if (scoreNum > criterion.maxScore) {
        res.status(400).json({
          message: `Score for '${criterion.name}' cannot exceed maximum of ${criterion.maxScore}`,
        });
        return;
      }

      calculatedTotal += scoreNum;
      validatedScores.push({
        criterionId: criterion._id,
        score: scoreNum,
      });
    }

    let evaluation = await Evaluation.findOne({
      roundId: team.roundId,
      judgeId,
      teamId,
    });

    if (evaluation) {
      if (evaluation.status === "SUBMITTED" && !round.allowJudgeEditAfterSubmit) {
        res.status(403).json({
          message: "Forbidden: Evaluation has already been submitted and cannot be edited.",
        });
        return;
      }

      evaluation.criteriaScores = validatedScores;
      evaluation.totalScore = calculatedTotal;
      evaluation.comments = comments ? comments.trim() : "";
      evaluation.status = "SUBMITTED";
      evaluation.submittedAt = new Date();
      await evaluation.save();
    } else {
      evaluation = await Evaluation.create({
        roundId: team.roundId,
        judgeId,
        teamId,
        status: "SUBMITTED",
        criteriaScores: validatedScores,
        totalScore: calculatedTotal,
        comments: comments ? comments.trim() : "",
        submittedAt: new Date(),
      });
    }

    res.json({
      message: "Evaluation submitted successfully",
      evaluation: {
        status: evaluation.status,
        totalScore: evaluation.totalScore,
        comments: evaluation.comments,
        criteriaScores: evaluation.criteriaScores,
        submittedAt: evaluation.submittedAt,
      },
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to submit evaluation" });
  }
};
