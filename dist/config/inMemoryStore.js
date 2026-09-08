"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.seedInMemoryStore = exports.memoryUsers = exports.memoryQuizResponses = exports.memoryWordCloudResponses = exports.memoryPollResponses = exports.memoryParticipants = exports.memoryActivities = exports.memoryEvents = exports.MemoryCollection = exports.wrapDoc = exports.generateId = exports.createModelProxy = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const db_1 = require("./db");
const createModelProxy = (mongooseModel, memoryCollection) => {
    return new Proxy(mongooseModel, {
        get(target, prop, receiver) {
            if (!(0, db_1.isDbConnected)()) {
                const memProp = memoryCollection[prop];
                if (typeof memProp === "function") {
                    return memProp.bind(memoryCollection);
                }
                if (prop in memoryCollection) {
                    return memProp;
                }
            }
            return Reflect.get(target, prop, receiver);
        },
        construct(target, args) {
            if (!(0, db_1.isDbConnected)()) {
                return (0, exports.wrapDoc)(args[0] || {}, memoryCollection.data);
            }
            return Reflect.construct(target, args);
        },
    });
};
exports.createModelProxy = createModelProxy;
// Helper to generate 24-character hex ID (similar to MongoDB ObjectId)
const generateId = () => {
    const timestamp = Math.floor(Date.now() / 1000).toString(16).padStart(8, "0");
    const randomPart = Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
    return `${timestamp}${randomPart}`;
};
exports.generateId = generateId;
// Create document wrapper with Mongoose document methods (toObject, save, etc.)
const wrapDoc = (doc, collection) => {
    if (!doc)
        return null;
    const idStr = doc._id ? doc._id.toString() : (doc.id ? doc.id.toString() : (0, exports.generateId)());
    const wrapped = {
        ...doc,
        _id: {
            toString: () => idStr,
            valueOf: () => idStr,
            toJSON: () => idStr,
        },
        get id() {
            return idStr;
        },
        toObject() {
            const copy = { ...doc };
            copy.id = idStr;
            copy._id = idStr;
            delete copy.save;
            delete copy.select;
            return copy;
        },
        toJSON() {
            const copy = { ...doc };
            copy.id = idStr;
            copy._id = idStr;
            delete copy.save;
            delete copy.select;
            return copy;
        },
        async save() {
            const idx = collection.findIndex((item) => (item._id && item._id.toString() === idStr) || (item.id && item.id.toString() === idStr));
            if (idx >= 0) {
                collection[idx] = { ...this };
            }
            else {
                collection.push({ ...this });
            }
            return this;
        },
    };
    return wrapped;
};
exports.wrapDoc = wrapDoc;
// Match document against MongoDB-style filter with safe string/ObjectId normalization
const normalizeVal = (val) => {
    if (val === null || val === undefined)
        return "";
    if (typeof val === "object") {
        if (val._id)
            return val._id.toString();
        if (val.id)
            return val.id.toString();
        if (typeof val.toString === "function")
            return val.toString();
    }
    return String(val);
};
const matchFilter = (item, filter) => {
    if (!filter || Object.keys(filter).length === 0)
        return true;
    for (const [key, value] of Object.entries(filter)) {
        if (key === "_id" || key === "id") {
            const itemId = item._id ? normalizeVal(item._id) : normalizeVal(item.id);
            if (value && typeof value === "object" && "$ne" in value) {
                if (itemId === normalizeVal(value.$ne))
                    return false;
            }
            else if (itemId !== normalizeVal(value)) {
                return false;
            }
        }
        else if (value && typeof value === "object" && "$ne" in value) {
            const itemVal = normalizeVal(item[key]);
            const neVal = normalizeVal(value.$ne);
            if (itemVal === neVal)
                return false;
        }
        else if (value && typeof value === "object" && "$in" in value && Array.isArray(value.$in)) {
            const itemVal = normalizeVal(item[key]);
            const inList = value.$in.map((v) => normalizeVal(v));
            if (!inList.includes(itemVal))
                return false;
        }
        else {
            const itemVal = normalizeVal(item[key]);
            const filterVal = normalizeVal(value);
            if (itemVal !== filterVal)
                return false;
        }
    }
    return true;
};
// Query builder supporting sort(), select(), and Promise resolution
class MemoryQuery {
    executor;
    sortFn = null;
    omitKeys = [];
    constructor(executor) {
        this.executor = executor;
    }
    sort(sortObj) {
        const [field, direction] = Object.entries(sortObj)[0] || [];
        if (field) {
            this.sortFn = (a, b) => {
                const aVal = a[field];
                const bVal = b[field];
                if (aVal === bVal)
                    return 0;
                if (direction < 0)
                    return aVal > bVal ? -1 : 1;
                return aVal > bVal ? 1 : -1;
            };
        }
        return this;
    }
    select(fields) {
        if (fields.startsWith("-")) {
            this.omitKeys = fields.substring(1).split(" ");
        }
        return this;
    }
    execute() {
        let result = this.executor();
        if (Array.isArray(result) && this.sortFn) {
            result = [...result].sort(this.sortFn);
        }
        if (result && this.omitKeys.length > 0) {
            if (Array.isArray(result)) {
                result = result.map((item) => {
                    const c = { ...item };
                    this.omitKeys.forEach((k) => delete c[k]);
                    return c;
                });
            }
            else {
                const c = { ...result };
                this.omitKeys.forEach((k) => delete c[k]);
                result = c;
            }
        }
        return result;
    }
    then(onfulfilled, onrejected) {
        try {
            const res = this.execute();
            return Promise.resolve(res).then(onfulfilled, onrejected);
        }
        catch (err) {
            if (onrejected) {
                return Promise.reject(err).catch(onrejected);
            }
            return Promise.reject(err);
        }
    }
}
// Memory Collection Implementation
class MemoryCollection {
    data = [];
    constructor(initialData = []) {
        this.data = initialData;
    }
    find(filter = {}) {
        return new MemoryQuery(() => {
            const matched = this.data.filter((item) => matchFilter(item, filter));
            return matched.map((item) => (0, exports.wrapDoc)(item, this.data));
        });
    }
    findOne(filter = {}) {
        return new MemoryQuery(() => {
            const item = this.data.find((doc) => matchFilter(doc, filter));
            return item ? (0, exports.wrapDoc)(item, this.data) : null;
        });
    }
    findById(id) {
        return new MemoryQuery(() => {
            const idStr = id?.toString();
            const item = this.data.find((doc) => (doc._id && doc._id.toString() === idStr) || (doc.id && doc.id.toString() === idStr));
            return item ? (0, exports.wrapDoc)(item, this.data) : null;
        });
    }
    async create(doc) {
        const _id = doc._id || (0, exports.generateId)();
        const created = {
            ...doc,
            _id,
            id: _id,
            createdAt: doc.createdAt || new Date(),
            updatedAt: new Date(),
        };
        // Sub-document option / question IDs
        if (Array.isArray(created.options)) {
            created.options = created.options.map((opt, idx) => ({
                ...opt,
                _id: opt._id || (0, exports.generateId)(),
                order_index: opt.order_index ?? idx,
            }));
        }
        if (Array.isArray(created.questions)) {
            created.questions = created.questions.map((q, qIdx) => ({
                ...q,
                _id: q._id || (0, exports.generateId)(),
                order_index: q.order_index ?? qIdx,
                options: (q.options || []).map((opt, oIdx) => ({
                    ...opt,
                    _id: opt._id || (0, exports.generateId)(),
                    order_index: opt.order_index ?? oIdx,
                })),
            }));
        }
        this.data.push(created);
        return (0, exports.wrapDoc)(created, this.data);
    }
    async findByIdAndUpdate(id, update, options = {}) {
        const idStr = id?.toString();
        const idx = this.data.findIndex((doc) => (doc._id && doc._id.toString() === idStr) || (doc.id && doc.id.toString() === idStr));
        if (idx === -1)
            return null;
        const current = this.data[idx];
        const updated = {
            ...current,
            ...update,
            updatedAt: new Date(),
        };
        this.data[idx] = updated;
        return (0, exports.wrapDoc)(updated, this.data);
    }
    async findByIdAndDelete(id) {
        const idStr = id?.toString();
        const idx = this.data.findIndex((doc) => (doc._id && doc._id.toString() === idStr) || (doc.id && doc.id.toString() === idStr));
        if (idx === -1)
            return null;
        const removed = this.data.splice(idx, 1)[0];
        return (0, exports.wrapDoc)(removed, this.data);
    }
    async updateOne(filter, update) {
        const idx = this.data.findIndex((item) => matchFilter(item, filter));
        if (idx !== -1) {
            this.data[idx] = { ...this.data[idx], ...update, updatedAt: new Date() };
            return { modifiedCount: 1 };
        }
        return { modifiedCount: 0 };
    }
    async updateMany(filter, update) {
        let modified = 0;
        this.data = this.data.map((item) => {
            if (matchFilter(item, filter)) {
                modified++;
                return { ...item, ...update, updatedAt: new Date() };
            }
            return item;
        });
        return { modifiedCount: modified };
    }
    async deleteMany(filter) {
        const initialLen = this.data.length;
        this.data = this.data.filter((item) => !matchFilter(item, filter));
        return { deletedCount: initialLen - this.data.length };
    }
    async countDocuments(filter = {}) {
        return this.data.filter((item) => matchFilter(item, filter)).length;
    }
}
exports.MemoryCollection = MemoryCollection;
// Global In-Memory Stores
exports.memoryEvents = new MemoryCollection();
exports.memoryActivities = new MemoryCollection();
exports.memoryParticipants = new MemoryCollection();
exports.memoryPollResponses = new MemoryCollection();
exports.memoryWordCloudResponses = new MemoryCollection();
exports.memoryQuizResponses = new MemoryCollection();
exports.memoryUsers = new MemoryCollection();
// Seed in-memory store with demo meetup event
const seedInMemoryStore = async () => {
    if (exports.memoryEvents.data.length > 0)
        return;
    const eventId = "65e000000000000000000001";
    const wordCloudId = "65e000000000000000000002";
    const pollId = "65e000000000000000000003";
    const quizId = "65e000000000000000000004";
    // 1. Admin User
    const adminEmail = (process.env.ADMIN_EMAIL || "admin@demo.org").trim().toLowerCase();
    const adminPassword = process.env.ADMIN_PASSWORD || "demo123";
    const adminName = process.env.ADMIN_NAME || "Administrator";
    const salt = await bcryptjs_1.default.genSalt(10);
    const passwordHash = await bcryptjs_1.default.hash(adminPassword, salt);
    await exports.memoryUsers.create({
        _id: "65e000000000000000000000",
        email: adminEmail,
        passwordHash,
        fullName: adminName,
        role: "admin",
    });
    // 2. Demo Event
    await exports.memoryEvents.create({
        _id: eventId,
        title: "React Kolkata Offline Meetup 2026",
        description: "Annual gathering of React, Next.js and frontend developers in Kolkata.",
        joinCode: "3157530",
        status: "WAITING",
        duration: 30,
        startedAt: null,
        endsAt: null,
        stoppedAt: null,
        theme: "dark",
        settings: {
            require_name: true,
            allow_anonymous: false,
            show_live_results: true,
        },
        activeActivityId: null,
    });
    // 3. Word Cloud Activity
    await exports.memoryActivities.create({
        _id: wordCloudId,
        eventId,
        type: "word_cloud",
        title: "Where Are You Joining From?",
        status: "active",
        orderIndex: 0,
        settings: { show_live_results: true },
    });
    // 4. Poll Activity
    await exports.memoryActivities.create({
        _id: pollId,
        eventId,
        type: "poll",
        title: "Which institute or company are you joining from?",
        status: "draft",
        orderIndex: 1,
        settings: { poll_type: "multiple", allow_multiple: true, show_live_results: true },
        options: [
            { _id: "65e000000000000000000011", text: "Techno India University", order_index: 0 },
            { _id: "65e000000000000000000012", text: "Brainware University", order_index: 1 },
            { _id: "65e000000000000000000013", text: "JIS College of Engineering", order_index: 2 },
            { _id: "65e000000000000000000014", text: "Other Institutes / Working Pros", order_index: 3 },
        ],
    });
    // 5. Quiz Activity
    await exports.memoryActivities.create({
        _id: quizId,
        eventId,
        type: "quiz",
        title: "React Kolkata Speed Trivia ⚡",
        status: "draft",
        orderIndex: 2,
        settings: { quiz_state: "answering" },
        activeQuestionIndex: 0,
        questions: [
            {
                _id: "65e000000000000000000021",
                question_text: "Which organization primarily created and maintains React?",
                time_limit_sec: 15,
                points: 1000,
                explanation: "React was created by Jordan Walke, a software engineer at Meta (Facebook).",
                order_index: 0,
                options: [
                    { _id: "65e000000000000000000031", option_text: "Google", is_correct: false, order_index: 0 },
                    { _id: "65e000000000000000000032", option_text: "Meta", is_correct: true, order_index: 1 },
                    { _id: "65e000000000000000000033", option_text: "Vercel", is_correct: false, order_index: 2 },
                    { _id: "65e000000000000000000034", option_text: "Microsoft", is_correct: false, order_index: 3 },
                ],
            },
            {
                _id: "65e000000000000000000022",
                question_text: "Which hook is used in React to manage component side effects?",
                time_limit_sec: 15,
                points: 1000,
                explanation: "useEffect lets you synchronize a component with an external system.",
                order_index: 1,
                options: [
                    { _id: "65e000000000000000000035", option_text: "useState", is_correct: false, order_index: 0 },
                    { _id: "65e000000000000000000036", option_text: "useEffect", is_correct: true, order_index: 1 },
                    { _id: "65e000000000000000000037", option_text: "useMemo", is_correct: false, order_index: 2 },
                    { _id: "65e000000000000000000038", option_text: "useCallback", is_correct: false, order_index: 3 },
                ],
            },
        ],
    });
    // 6. Sample Participants
    const sampleParticipants = [
        { name: "Prodipta Roy", id: "65e000000000000000000041" },
        { name: "Rashmi Tiwari", id: "65e000000000000000000042" },
        { name: "Suman Singha", id: "65e000000000000000000043" },
        { name: "Soumyadeep Dey", id: "65e000000000000000000044" },
        { name: "Subha Sasmal", id: "65e000000000000000000045" },
    ];
    for (const p of sampleParticipants) {
        await exports.memoryParticipants.create({
            _id: p.id,
            eventId,
            name: p.name,
            sessionToken: "sess_" + p.name.toLowerCase().replace(/\s/g, "_"),
            joinedAt: new Date(),
        });
    }
    // 7. Seed Word Cloud words
    const words = [
        "React Kolkata",
        "React Kolkata",
        "Techno India",
        "Techno India",
        "Kolkata",
        "Brainware University",
        "JISCE",
        "Howrah",
        "Siliguri",
    ];
    for (const w of words) {
        await exports.memoryWordCloudResponses.create({
            activityId: wordCloudId,
            participantId: "seed_part",
            word: w,
            normalizedWord: w.toLowerCase().replace(/[^\w\s]/gi, ""),
        });
    }
    console.log("⚡ [In-Memory DB] Initial demo event (#3157530) seeded successfully!");
};
exports.seedInMemoryStore = seedInMemoryStore;
// Auto-seed in-memory store immediately
(0, exports.seedInMemoryStore)();
