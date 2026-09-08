import bcrypt from "bcryptjs";
import { isDbConnected } from "./db";

export const createModelProxy = <T>(mongooseModel: any, memoryCollection: MemoryCollection<any>): T => {
  return new Proxy(mongooseModel, {
    get(target, prop, receiver) {
      if (!isDbConnected()) {
        const memProp = (memoryCollection as any)[prop];
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
      if (!isDbConnected()) {
        return wrapDoc(args[0] || {}, memoryCollection.data);
      }
      return Reflect.construct(target, args);
    },
  }) as unknown as T;
};

// Helper to generate 24-character hex ID (similar to MongoDB ObjectId)
export const generateId = (): string => {
  const timestamp = Math.floor(Date.now() / 1000).toString(16).padStart(8, "0");
  const randomPart = Array.from({ length: 16 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join("");
  return `${timestamp}${randomPart}`;
};

// Create document wrapper with Mongoose document methods (toObject, save, etc.)
export const wrapDoc = <T extends Record<string, any>>(doc: T, collection: T[]): any => {
  if (!doc) return null;

  const idStr = doc._id ? doc._id.toString() : (doc.id ? doc.id.toString() : generateId());
  
  const wrapped: any = {
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
      const copy: any = { ...doc };
      copy.id = idStr;
      copy._id = idStr;
      delete copy.save;
      delete copy.select;
      return copy;
    },
    toJSON() {
      const copy: any = { ...doc };
      copy.id = idStr;
      copy._id = idStr;
      delete copy.save;
      delete copy.select;
      return copy;
    },
    async save() {
      const idx = collection.findIndex(
        (item: any) =>
          (item._id && item._id.toString() === idStr) || (item.id && item.id.toString() === idStr)
      );
      if (idx >= 0) {
        collection[idx] = { ...this };
      } else {
        collection.push({ ...this });
      }
      return this;
    },
  };

  return wrapped;
};

// Match document against MongoDB-style filter with safe string/ObjectId normalization
const normalizeVal = (val: any): string => {
  if (val === null || val === undefined) return "";
  if (typeof val === "object") {
    if (val._id) return val._id.toString();
    if (val.id) return val.id.toString();
    if (typeof val.toString === "function") return val.toString();
  }
  return String(val);
};

const matchFilter = (item: any, filter: Record<string, any>): boolean => {
  if (!filter || Object.keys(filter).length === 0) return true;

  for (const [key, value] of Object.entries(filter)) {
    if (key === "_id" || key === "id") {
      const itemId = item._id ? normalizeVal(item._id) : normalizeVal(item.id);
      if (value && typeof value === "object" && "$ne" in value) {
        if (itemId === normalizeVal(value.$ne)) return false;
      } else if (itemId !== normalizeVal(value)) {
        return false;
      }
    } else if (value && typeof value === "object" && "$ne" in value) {
      const itemVal = normalizeVal(item[key]);
      const neVal = normalizeVal(value.$ne);
      if (itemVal === neVal) return false;
    } else if (value && typeof value === "object" && "$in" in value && Array.isArray(value.$in)) {
      const itemVal = normalizeVal(item[key]);
      const inList = value.$in.map((v: any) => normalizeVal(v));
      if (!inList.includes(itemVal)) return false;
    } else {
      const itemVal = normalizeVal(item[key]);
      const filterVal = normalizeVal(value);
      if (itemVal !== filterVal) return false;
    }
  }
  return true;
};

// Query builder supporting sort(), select(), and Promise resolution
class MemoryQuery<T> implements PromiseLike<T> {
  private executor: () => T;
  private sortFn: ((a: any, b: any) => number) | null = null;
  private omitKeys: string[] = [];

  constructor(executor: () => T) {
    this.executor = executor;
  }

  sort(sortObj: Record<string, number>): this {
    const [field, direction] = Object.entries(sortObj)[0] || [];
    if (field) {
      this.sortFn = (a, b) => {
        const aVal = a[field];
        const bVal = b[field];
        if (aVal === bVal) return 0;
        if (direction < 0) return aVal > bVal ? -1 : 1;
        return aVal > bVal ? 1 : -1;
      };
    }
    return this;
  }

  select(fields: string): this {
    if (fields.startsWith("-")) {
      this.omitKeys = fields.substring(1).split(" ");
    }
    return this;
  }

  private execute(): T {
    let result: any = this.executor();
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
      } else {
        const c = { ...result };
        this.omitKeys.forEach((k) => delete c[k]);
        result = c;
      }
    }
    return result;
  }

  then<TResult1 = T, TResult2 = never>(
    onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    try {
      const res = this.execute();
      return Promise.resolve(res).then(onfulfilled, onrejected);
    } catch (err) {
      if (onrejected) {
        return Promise.reject(err).catch(onrejected);
      }
      return Promise.reject(err);
    }
  }
}

// Memory Collection Implementation
export class MemoryCollection<T extends Record<string, any>> {
  public data: T[] = [];

  constructor(initialData: T[] = []) {
    this.data = initialData;
  }

  find(filter: Record<string, any> = {}): MemoryQuery<any[]> {
    return new MemoryQuery(() => {
      const matched = this.data.filter((item) => matchFilter(item, filter));
      return matched.map((item) => wrapDoc(item, this.data));
    });
  }

  findOne(filter: Record<string, any> = {}): MemoryQuery<any | null> {
    return new MemoryQuery(() => {
      const item = this.data.find((doc) => matchFilter(doc, filter));
      return item ? wrapDoc(item, this.data) : null;
    });
  }

  findById(id: any): MemoryQuery<any | null> {
    return new MemoryQuery(() => {
      const idStr = id?.toString();
      const item = this.data.find(
        (doc) => (doc._id && doc._id.toString() === idStr) || (doc.id && doc.id.toString() === idStr)
      );
      return item ? wrapDoc(item, this.data) : null;
    });
  }

  async create(doc: any): Promise<any> {
    const _id = doc._id || generateId();
    const created = {
      ...doc,
      _id,
      id: _id,
      createdAt: doc.createdAt || new Date(),
      updatedAt: new Date(),
    };

    // Sub-document option / question IDs
    if (Array.isArray(created.options)) {
      created.options = created.options.map((opt: any, idx: number) => ({
        ...opt,
        _id: opt._id || generateId(),
        order_index: opt.order_index ?? idx,
      }));
    }
    if (Array.isArray(created.questions)) {
      created.questions = created.questions.map((q: any, qIdx: number) => ({
        ...q,
        _id: q._id || generateId(),
        order_index: q.order_index ?? qIdx,
        options: (q.options || []).map((opt: any, oIdx: number) => ({
          ...opt,
          _id: opt._id || generateId(),
          order_index: opt.order_index ?? oIdx,
        })),
      }));
    }

    this.data.push(created);
    return wrapDoc(created, this.data);
  }

  async findByIdAndUpdate(id: any, update: any, options: any = {}): Promise<any | null> {
    const idStr = id?.toString();
    const idx = this.data.findIndex(
      (doc) => (doc._id && doc._id.toString() === idStr) || (doc.id && doc.id.toString() === idStr)
    );
    if (idx === -1) return null;

    const current = this.data[idx];
    const updated = {
      ...current,
      ...update,
      updatedAt: new Date(),
    };
    this.data[idx] = updated;
    return wrapDoc(updated, this.data);
  }

  async findByIdAndDelete(id: any): Promise<any | null> {
    const idStr = id?.toString();
    const idx = this.data.findIndex(
      (doc) => (doc._id && doc._id.toString() === idStr) || (doc.id && doc.id.toString() === idStr)
    );
    if (idx === -1) return null;
    const removed = this.data.splice(idx, 1)[0];
    return wrapDoc(removed, this.data);
  }

  async updateOne(filter: Record<string, any>, update: any): Promise<{ modifiedCount: number }> {
    const idx = this.data.findIndex((item) => matchFilter(item, filter));
    if (idx !== -1) {
      this.data[idx] = { ...this.data[idx], ...update, updatedAt: new Date() };
      return { modifiedCount: 1 };
    }
    return { modifiedCount: 0 };
  }

  async updateMany(filter: Record<string, any>, update: any): Promise<{ modifiedCount: number }> {
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

  async deleteMany(filter: Record<string, any>): Promise<{ deletedCount: number }> {
    const initialLen = this.data.length;
    this.data = this.data.filter((item) => !matchFilter(item, filter));
    return { deletedCount: initialLen - this.data.length };
  }

  async countDocuments(filter: Record<string, any> = {}): Promise<number> {
    return this.data.filter((item) => matchFilter(item, filter)).length;
  }
}

// Global In-Memory Stores
export const memoryEvents = new MemoryCollection<any>();
export const memoryActivities = new MemoryCollection<any>();
export const memoryParticipants = new MemoryCollection<any>();
export const memoryPollResponses = new MemoryCollection<any>();
export const memoryWordCloudResponses = new MemoryCollection<any>();
export const memoryQuizResponses = new MemoryCollection<any>();
export const memoryUsers = new MemoryCollection<any>();

// Seed in-memory store with default admin user if not exists
export const seedInMemoryStore = async (): Promise<void> => {
  if (memoryUsers.data.length > 0) return;

  // Admin User
  const adminEmail = (process.env.ADMIN_EMAIL || "admin@demo.org").trim().toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD || "demo123";
  const adminName = process.env.ADMIN_NAME || "Administrator";

  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(adminPassword, salt);
  await memoryUsers.create({
    _id: "65e000000000000000000000",
    email: adminEmail,
    passwordHash,
    fullName: adminName,
    role: "admin",
  });
};

// Auto-seed in-memory store admin user immediately
seedInMemoryStore();

