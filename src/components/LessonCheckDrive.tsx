"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import { Copy, ExternalLink, QrCode } from "lucide-react";
import type { Material } from "@/lib/contracts";
import {
  connectLessonCheckDrive, createLessonCheckFolder, LessonCheckDriveError, shareLessonCheckDoc, uploadLessonCheckDoc,
  type DriveSharing, type DriveToken,
} from "@/lib/lesson-check-drive";
import { lessonCheckFileName, studentIdentityLine, type LessonCheckStudent } from "@/lib/lesson-check-roster";

const clientId = process.env.NEXT_PUBLIC_GOOGLE_DRIVE_CLIENT_ID?.trim();
type Entry = { id?: string; shared?: boolean; error?: string };
const docLink = (id: string) => `https://docs.google.com/document/d/${id}/edit`;
const folderLink = (id: string) => `https://drive.google.com/drive/folders/${id}`;

export function LessonCheckDrive({ material, students, onState }: {
  material: Material;
  students: LessonCheckStudent[];
  onState: (state: { busy: boolean; hasFolder: boolean }) => void;
}) {
  const [ready, setReady] = useState(false);
  const [opened, setOpened] = useState(false);
  const [sharing, setSharing] = useState<DriveSharing>("email");
  const [confirmed, setConfirmed] = useState(false);
  const [folder, setFolder] = useState("");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [qr, setQr] = useState<{ index: number; data: string }>();
  const operation = useRef<AbortController | null>(null);
  const token = useRef<DriveToken | null>(null);
  const qrRequest = useRef(0);
  const allHaveEmail = students.every((student) => student.email);
  const shared = entries.filter((entry) => entry?.shared).length;

  useEffect(() => () => operation.current?.abort(), []);
  useEffect(() => onState({ busy, hasFolder: !!folder }), [busy, folder, onState]);

  async function exportDrive() {
    if (!clientId || !ready || operation.current || shared === students.length) return;
    if ((sharing === "email" && !allHaveEmail) || (sharing === "link" && !confirmed)) return;
    const controller = new AbortController();
    operation.current = controller;
    const signal = controller.signal;
    setBusy(true);
    setMessage("");
    let folderId = folder;
    const batch = [...entries];
    function record(index: number, entry: Entry) {
      batch[index] = entry;
      setEntries([...batch]);
    }
    try {
      if (!token.current || Date.now() >= token.current.expiresAt) {
        token.current = await connectLessonCheckDrive(clientId, !!folderId);
      }
      const access = token.current;
      signal.throwIfAborted();
      const { examWordFile } = await import("@/lib/exam-word");
      if (!folderId) {
        // Check formatting before creating a folder in the teacher's Drive.
        await examWordFile(material, false, [], students[0]);
        folderId = await createLessonCheckFolder(access, `${material.title} (${new Date().toLocaleString("vi-VN")})`, signal);
        setFolder(folderId);
      }
      for (const [index, student] of students.entries()) {
        if (batch[index]?.shared) continue;
        signal.throwIfAborted();
        let id = batch[index]?.id;
        try {
          if (!id) {
            const file = await examWordFile(material, false, [], student);
            id = await uploadLessonCheckDoc(access, folderId, lessonCheckFileName(student, index), file, signal);
            record(index, { id });
          }
          await shareLessonCheckDoc(access, id, sharing, student.email, signal);
          record(index, { id, shared: true });
        } catch (error) {
          if (signal.aborted || error instanceof LessonCheckDriveError && [401, 429].includes(error.status) ||
              error instanceof TypeError) throw error;
          record(index, { id, error: error instanceof Error ? error.message : "Chưa thể xuất phiếu này." });
        }
      }
      setMessage(batch.filter((entry) => entry?.shared).length === students.length
        ? "Đã tạo và cấp quyền chỉnh sửa cho tất cả phiếu."
        : "Còn phiếu chưa cấp quyền hoặc chưa tải lên. Xem lỗi từng dòng rồi thử tiếp tục.");
    } catch (error) {
      if (signal.aborted) return;
      if (error instanceof LessonCheckDriveError && error.status === 401) token.current = null;
      setMessage(error instanceof TypeError ? "Kết nối với Google Drive bị gián đoạn. Bạn có thể thử tiếp tục."
        : error instanceof Error ? error.message : "Chưa thể xuất phiếu lên Google Drive.");
    } finally {
      operation.current = null;
      if (!signal.aborted) setBusy(false);
    }
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setMessage("Đã sao chép liên kết.");
    } catch {
      setMessage("Chưa sao chép được. Bạn có thể mở phiếu và sao chép từ thanh địa chỉ.");
    }
  }

  async function showQr(id: string, index: number) {
    const requestId = ++qrRequest.current;
    if (qr?.index === index) { setQr(undefined); return; }
    try {
      const { toDataURL } = await import("qrcode");
      const data = await toDataURL(docLink(id), { width: 216, margin: 3 });
      if (requestId === qrRequest.current) setQr({ index, data });
    } catch {
      setMessage("Chưa tạo được mã QR cho phiếu này.");
    }
  }

  return <details className="lesson-check-drive" onToggle={(event) => {
    if (event.currentTarget.open) setOpened(true);
  }}>
    <summary>Xuất Google Drive</summary>
    {clientId && opened && <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive"
      onReady={() => setReady(true)} onError={() => setMessage("Chưa tải được dịch vụ đăng nhập Google.")} />}
    {clientId ? <>
      <p>Mỗi học sinh nhận một Google Docs có chỗ điền đáp án. Thư mục tổng nằm trong Drive của giáo viên.</p>
      <label className="lesson-check-field">Quyền chỉnh sửa
        <select value={sharing} disabled={busy || !!folder} onChange={(event) => {
          setSharing(event.target.value as DriveSharing);
          setConfirmed(false);
        }}>
          <option value="email">Chỉ email của học sinh</option>
          <option value="link">Ai có liên kết của phiếu</option>
        </select>
      </label>
      {sharing === "email" && !allHaveEmail && <p>Thêm email cho tất cả học sinh để dùng chế độ này, hoặc chọn chia sẻ qua liên kết.</p>}
      {sharing === "link" && <label className="lesson-check-confirm">
        <input type="checkbox" checked={confirmed} disabled={busy || !!folder} onChange={(event) => setConfirmed(event.target.checked)} />
        Tôi hiểu ai có link hoặc mã QR đều có thể sửa phiếu tương ứng.
      </label>}
      <div className="lesson-check-actions">
        <button type="button" className="gs-primary" disabled={!ready || busy || shared === students.length ||
          (sharing === "email" ? !allHaveEmail : !confirmed)} onClick={() => void exportDrive()}>
          {busy ? `Đang xuất (${shared}/${students.length})…` : folder ? (shared === students.length ? "Đã xuất Drive" : "Tiếp tục xuất Drive") : "Kết nối và xuất Drive"}
        </button>
        {folder && <a className="gs-secondary" href={folderLink(folder)} target="_blank" rel="noreferrer"><ExternalLink size={15} /> Mở thư mục</a>}
      </div>
      {entries.length > 0 && <ul className="lesson-check-links">
        {students.map((student, index) => {
          const entry = entries[index];
          return <li key={index}>
            <strong>{studentIdentityLine(student)}</strong>
            {entry?.id && entry.shared ? <div className="lesson-check-actions">
              <a className="gs-secondary" href={docLink(entry.id)} target="_blank" rel="noreferrer">Mở phiếu Google Docs</a>
              <button className="gs-secondary" type="button" onClick={() => void copy(docLink(entry.id!))}><Copy size={14} /> Sao chép link Google Docs</button>
              <button className="gs-secondary" type="button" aria-expanded={qr?.index === index} onClick={() => void showQr(entry.id!, index)}><QrCode size={16} /> Mã QR</button>
            </div> : <small>{entry?.error || (entry?.id ? "Đã tạo, chờ cấp quyền" : "Chờ tải lên")}</small>}
            {qr?.index === index && <a className="lesson-check-qr" href={qr.data} download={`${lessonCheckFileName(student, index)}.png`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img width={216} height={216} src={qr.data} alt={`Mã QR của ${studentIdentityLine(student)}`} />Tải mã QR
            </a>}
          </li>;
        })}
      </ul>}
    </> : <p>Google Drive chưa được cấu hình cho MathCos. Bạn vẫn có thể tải Word hoặc lưu PDF.</p>}
    {message && <p role="status">{message}</p>}
  </details>;
}
