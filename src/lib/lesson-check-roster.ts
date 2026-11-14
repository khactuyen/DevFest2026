export type StudentIdentity = { id: string; name: string };
export type LessonCheckStudent = StudentIdentity & { email: string };

export const maxLessonCheckStudents = 200;
export const rosterTemplate = "\uFEFFma_hoc_sinh,ho_ten,email\r\nHS001,Nguyễn An,an@example.com\r\nHS002,Trần Bình,binh@example.com\r\n";

export function studentIdentityLine(student: StudentIdentity) {
  return [student.id && `Mã học sinh ${student.id}`, student.name && `Họ và tên ${student.name}`].filter(Boolean).join(" · ");
}

export function lessonCheckFileName(student: StudentIdentity, index: number) {
  const identity = [student.id, student.name].filter(Boolean).join(" - ")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-").slice(0, 120).trim().replace(/\.+$/, "");
  return `Phiếu ${String(index + 1).padStart(3, "0")} - ${identity}`;
}

export function numberedStudents(count: number): LessonCheckStudent[] {
  if (!Number.isInteger(count) || count < 1 || count > maxLessonCheckStudents) {
    throw Error(`Nhập từ 1 đến ${maxLessonCheckStudents} học sinh.`);
  }
  return Array.from({ length: count }, (_, index) => ({
    id: `HS${String(index + 1).padStart(3, "0")}`, name: "", email: "",
  }));
}

function csvRows(text: string) {
  const separator = text.split(/\r?\n/, 1)[0].includes(";") ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  let closed = false;
  const finishCell = () => {
    row.push(value);
    value = "";
    closed = false;
  };
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char !== '"') value += char;
      else if (text[i + 1] === '"') { value += '"'; i++; }
      else { quoted = false; closed = true; }
    } else if (char === separator || char === "\r" || char === "\n") {
      finishCell();
      if (char === separator) continue;
      rows.push(row);
      row = [];
      if (char === "\r" && text[i + 1] === "\n") i++;
    } else if (char === '"' && !value && !closed) quoted = true;
    else if (closed || char === '"') throw Error(`Dòng ${rows.length + 1} của CSV có dấu ngoặc kép sai định dạng.`);
    else value += char;
  }
  if (quoted) throw Error("CSV có ô chưa đóng dấu ngoặc kép.");
  finishCell();
  rows.push(row);
  return rows;
}

export function validateStudents(students: LessonCheckStudent[]) {
  if (students.length < 1 || students.length > maxLessonCheckStudents) {
    throw Error(`Danh sách cần có từ 1 đến ${maxLessonCheckStudents} học sinh.`);
  }
  const identities = new Set<string>();
  return students.map((student, index) => {
    const id = student.id.trim();
    const name = student.name.trim();
    const email = student.email.trim().toLowerCase();
    const line = `Học sinh ${index + 1}`;
    if (!id && !name) throw Error(`${line} cần có mã hoặc họ tên.`);
    if (id.length > 60 || name.length > 120 || /[\r\n\t]/.test(id + name)) throw Error(`${line} có mã hoặc tên không hợp lệ.`);
    if (email && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) throw Error(`${line} có email không hợp lệ.`);
    const key = (id ? `id:${id}` : `name:${name}`).normalize("NFC").toLocaleLowerCase("vi");
    if (identities.has(key)) throw Error(`${line} bị trùng mã hoặc trùng tên khi thiếu mã.`);
    identities.add(key);
    return { id, name, email };
  });
}

export function parseLessonCheckRoster(rows: readonly (readonly unknown[])[]) {
  const headers = rows[0]?.map((cell) => String(cell ?? "").trim().toLowerCase()) ?? [];
  const columns = ["ma_hoc_sinh", "ho_ten", "email"];
  if ((!headers.includes(columns[0]) && !headers.includes(columns[1])) ||
      columns.some((column) => headers.indexOf(column) !== headers.lastIndexOf(column))) {
    throw Error("Hàng đầu cần có cột ma_hoc_sinh hoặc ho_ten, và có thể thêm cột email. Hãy tải CSV mẫu để đối chiếu.");
  }
  const indexes = columns.map((column) => headers.indexOf(column));
  return validateStudents(rows.slice(1).filter((row) => row.some((cell) => String(cell ?? "").trim())).map((row) => {
    const [id, name, email] = indexes.map((column) => String(row[column] ?? "").trim());
    return { id, name, email };
  }));
}

export async function readLessonCheckRoster(file: File) {
  if (file.size > 2 * 1024 * 1024) throw Error("Danh sách lớp tối đa 2 MB.");
  if (/\.csv$/i.test(file.name)) return parseLessonCheckRoster(csvRows((await file.text()).replace(/^\uFEFF/, "")));
  if (!/\.xlsx$/i.test(file.name)) throw Error("Chọn tệp Excel .xlsx hoặc CSV.");
  const { readSheet } = await import("read-excel-file/browser");
  return parseLessonCheckRoster(await readSheet(file, 1));
}
