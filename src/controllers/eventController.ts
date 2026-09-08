import { Request, Response } from "express";
import { Event } from "../models/Event";
import { Participant } from "../models/Participant";
import { Activity } from "../models/Activity";
import { emitToEventRoom } from "../sockets/socketHandler";

const generateJoinCode = async (): Promise<string> => {
  let code = "";
  let exists = true;
  while (exists) {
    code = Math.floor(1000000 + Math.random() * 9000000).toString();
    const found = await Event.findOne({ joinCode: code });
    if (!found) exists = false;
  }
  return code;
};

export const getEvents = async (req: Request, res: Response): Promise<void> => {
  try {
    const events = await Event.find().sort({ createdAt: -1 });

    const enriched = await Promise.all(
      events.map(async (event) => {
        const participant_count = await Participant.countDocuments({ eventId: event._id });
        const activity_count = await Activity.countDocuments({ eventId: event._id });
        return {
          ...event.toObject(),
          id: event._id,
          participant_count,
          activity_count,
        };
      })
    );

    res.json(enriched);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getEventById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const event = await Event.findById(id);
    if (!event) {
      res.status(404).json({ message: "Event not found" });
      return;
    }

    const participant_count = await Participant.countDocuments({ eventId: event._id });
    const activity_count = await Activity.countDocuments({ eventId: event._id });

    res.json({
      ...event.toObject(),
      id: event._id,
      participant_count,
      activity_count,
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getEventByCode = async (req: Request, res: Response): Promise<void> => {
  try {
    const { code } = req.params;
    const cleanCode = code.trim().replace("#", "");
    const event = await Event.findOne({ joinCode: cleanCode });
    if (!event) {
      res.status(404).json({ message: "Event with this join code not found" });
      return;
    }

    const participant_count = await Participant.countDocuments({ eventId: event._id });
    const activity_count = await Activity.countDocuments({ eventId: event._id });

    res.json({
      ...event.toObject(),
      id: event._id,
      participant_count,
      activity_count,
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const createEvent = async (req: Request, res: Response): Promise<void> => {
  try {
    const { title, description, settings, theme, duration } = req.body;
    if (!title || !title.trim()) {
      res.status(400).json({ message: "Event title is required" });
      return;
    }

    const joinCode = await generateJoinCode();
    const eventDuration = Number(duration) || 30;

    const event = await Event.create({
      title: title.trim(),
      description: description || "",
      joinCode,
      status: "WAITING",
      duration: eventDuration,
      startedAt: null,
      endsAt: null,
      stoppedAt: null,
      theme: theme || "dark",
      settings: {
        require_name: true,
        allow_anonymous: false,
        show_live_results: true,
        ...settings,
      },
    });

    res.status(201).json({
      ...event.toObject(),
      id: event._id,
      participant_count: 0,
      activity_count: 0,
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const updateEvent = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const updated = await Event.findByIdAndUpdate(id, req.body, { new: true });
    if (!updated) {
      res.status(404).json({ message: "Event not found" });
      return;
    }
    res.json({ ...updated.toObject(), id: updated._id });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const startEvent = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { duration } = req.body;

    const event = await Event.findById(id);
    if (!event) {
      res.status(404).json({ message: "Event not found" });
      return;
    }

    const eventDuration = Number(duration) || Number(event.duration) || 30;
    const startedAt = new Date();
    const endsAt = new Date(startedAt.getTime() + eventDuration * 60 * 1000);

    event.status = "LIVE";
    event.duration = eventDuration;
    event.startedAt = startedAt;
    event.endsAt = endsAt;
    event.stoppedAt = null;

    await event.save();

    const payload = {
      eventId: event._id.toString(),
      status: "LIVE",
      duration: eventDuration,
      startedAt,
      endsAt,
      serverTime: new Date(),
    };

    emitToEventRoom(event._id.toString(), "event:started", payload);

    res.json({
      ...event.toObject(),
      id: event._id,
      serverTime: new Date(),
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const stopEvent = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const event = await Event.findById(id);
    if (!event) {
      res.status(404).json({ message: "Event not found" });
      return;
    }

    const stoppedAt = new Date();
    event.status = "ENDED";
    event.stoppedAt = stoppedAt;

    await event.save();

    const payload = {
      eventId: event._id.toString(),
      status: "ENDED",
      stoppedAt,
      reason: "admin_stopped",
      serverTime: new Date(),
    };

    emitToEventRoom(event._id.toString(), "event:ended", payload);

    res.json({
      ...event.toObject(),
      id: event._id,
      serverTime: new Date(),
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getEventStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const event = await Event.findById(id);
    if (!event) {
      res.status(404).json({ message: "Event not found" });
      return;
    }

    const serverTime = new Date();
    let remainingTimeMs = 0;
    if ((event.status === "LIVE" || event.status === "live") && event.endsAt) {
      remainingTimeMs = Math.max(0, new Date(event.endsAt).getTime() - serverTime.getTime());
      if (remainingTimeMs === 0) {
        event.status = "ENDED";
        event.stoppedAt = serverTime;
        await event.save();
        emitToEventRoom(event._id.toString(), "event:ended", {
          eventId: event._id.toString(),
          status: "ENDED",
          stoppedAt: serverTime,
          reason: "timer_expired",
        });
      }
    }

    res.json({
      id: event._id,
      status: event.status,
      duration: event.duration || 30,
      startedAt: event.startedAt,
      endsAt: event.endsAt,
      stoppedAt: event.stoppedAt,
      serverTime,
      remainingTimeMs,
      activeActivityId: event.activeActivityId,
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const deleteEvent = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    await Event.findByIdAndDelete(id);
    await Activity.deleteMany({ eventId: id });
    await Participant.deleteMany({ eventId: id });
    res.json({ message: "Event and associated records deleted successfully" });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const joinEvent = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, email, sessionToken } = req.body;

    const event = await Event.findById(id);
    if (!event) {
      res.status(404).json({ message: "Event not found" });
      return;
    }

    const token = sessionToken || "sess_" + Math.random().toString(36).substring(2, 12);
    let participant = await Participant.findOne({ eventId: event._id, sessionToken: token });

    if (participant) {
      if (name && name.trim()) {
        participant.name = name.trim();
        await participant.save();
      }
    } else {
      participant = await Participant.create({
        eventId: event._id,
        name: name?.trim() || "Participant",
        email: email?.trim(),
        sessionToken: token,
      });
    }

    const totalCount = await Participant.countDocuments({ eventId: event._id });

    // Socket.IO Emit: participant:joined and participants:updated
    emitToEventRoom(event._id.toString(), "participant:joined", {
      participant: {
        id: participant._id,
        name: participant.name,
        joinedAt: participant.joinedAt,
      },
      count: totalCount,
    });

    emitToEventRoom(event._id.toString(), "participants:updated", {
      count: totalCount,
    });

    res.json({
      participant: {
        id: participant._id,
        name: participant.name,
        email: participant.email,
        session_token: participant.sessionToken,
        joined_at: participant.joinedAt,
      },
      event: {
        ...event.toObject(),
        id: event._id,
      },
      count: totalCount,
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getParticipants = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const participants = await Participant.find({ eventId: id }).sort({ joinedAt: -1 });
    res.json(
      participants.map((p) => ({
        id: p._id,
        name: p.name,
        email: p.email,
        session_token: p.sessionToken,
        joined_at: p.joinedAt,
      }))
    );
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const checkAndEndExpiredEvents = async (): Promise<void> => {
  try {
    const now = new Date();
    const liveEvents = await Event.find({
      status: { $in: ["LIVE", "live", "active"] },
      endsAt: { $ne: null, $lte: now },
    });

    for (const event of liveEvents) {
      event.status = "ENDED";
      event.stoppedAt = now;
      await event.save();
      emitToEventRoom(event._id.toString(), "event:ended", {
        eventId: event._id.toString(),
        status: "ENDED",
        stoppedAt: now,
        reason: "timer_expired",
      });
      console.log(`[Lifecycle] Event ${event._id} (${event.title}) automatically ENDED by timer.`);
    }
  } catch (e) {
    // Ignore ticker error
  }
};
