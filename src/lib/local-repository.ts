import { promises as fs } from "node:fs";
import path from "node:path";
import { AppError } from "./app-error";
const runtimeState = globalThis as typeof globalThis & { __mathRepositoryQueues?: Map<string, Promise<void>> };
const queues = runtimeState.__mathRepositoryQueues ||= new Map<string, Promise<void>>();
export function localRepository<T>(name: string, parse: (value: unknown) => T) {
  const file = () => path.join(process.env.MATH_STUDIO_DATA_DIR || path.join(process.cwd(), "data"), name);
  async function load(): Promise<T[]> {
    if (process.env.NODE_ENV === "production") throw new AppError(503, "Kho dữ liệu production chưa được cấu hình.");
    try { return (JSON.parse(await fs.readFile(file(), "utf8")) as unknown[]).map(parse); }
    catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return []; throw e; }
  }
  return {
    async read() { await queues.get(file()); return load(); },
    async mutate<R>(change: (rows: T[]) => R | Promise<R>): Promise<R> {
      const target = file(); let result!: R;
      const task = (queues.get(target) || Promise.resolve()).then(async () => {
        const rows = await load(); result = await change(rows);
        await fs.mkdir(path.dirname(target), { recursive: true });
        const temporary = `${target}.${crypto.randomUUID()}.tmp`;
        await fs.writeFile(temporary, JSON.stringify(rows), { mode: 0o600 });
        await fs.rename(temporary, target);
      });
      queues.set(target, task.catch(() => {})); await task; return result;
    },
  };
}
