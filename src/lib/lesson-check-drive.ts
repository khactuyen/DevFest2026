import { examWordMime } from "./exam-word";

const driveScope = "https://www.googleapis.com/auth/drive.file";
const driveApi = "https://www.googleapis.com/drive/v3";
const googleDoc = "application/vnd.google-apps.document";

type TokenResponse = { access_token?: string; expires_in?: number | string; scope?: string };
type GoogleOAuth = {
  initTokenClient: (config: {
    client_id: string;
    scope: string;
    callback: (response: TokenResponse) => void;
    error_callback: (error: { type: string }) => void;
  }) => { requestAccessToken: (options: { prompt: string }) => void };
};

export type DriveToken = { value: string; expiresAt: number };
export type DriveSharing = "email" | "link";

export function connectLessonCheckDrive(clientId: string, reconnect: boolean): Promise<DriveToken> {
  const oauth = (window as Window & { google?: { accounts?: { oauth2?: GoogleOAuth } } }).google?.accounts?.oauth2;
  if (!oauth) return Promise.reject(Error("Chưa tải được hộp đăng nhập Google. Hãy thử lại."));
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(Error("Hết thời gian kết nối Google. Hãy thử lại.")), 120_000);
    const client = oauth.initTokenClient({
      client_id: clientId,
      scope: driveScope,
      callback(response) {
        window.clearTimeout(timer);
        const duration = Number(response.expires_in);
        if (!response.access_token || !response.scope?.split(/\s+/).includes(driveScope) || !(duration > 0)) {
          reject(Error("Bạn cần cấp quyền Drive cho MathCos để xuất phiếu."));
          return;
        }
        resolve({ value: response.access_token, expiresAt: Date.now() + duration * 1000 });
      },
      error_callback(error) {
        window.clearTimeout(timer);
        reject(Error(error.type === "popup_failed_to_open"
          ? "Trình duyệt đã chặn cửa sổ Google. Hãy cho phép cửa sổ bật lên rồi thử lại."
          : "Kết nối Google Drive đã dừng. Bạn có thể thử lại."));
      },
    });
    try {
      client.requestAccessToken({ prompt: reconnect ? "" : "select_account" });
    } catch (error) {
      window.clearTimeout(timer);
      reject(error);
    }
  });
}

export class LessonCheckDriveError extends Error {
  constructor(readonly status: number) {
    super(status === 401 ? "Phiên Google đã hết hạn. Kết nối lại để tiếp tục."
      : status === 403 ? "Google từ chối quyền truy cập hoặc chia sẻ. Kiểm tra tài khoản và chính sách Drive."
        : status === 429 ? "Drive đang giới hạn yêu cầu. Thử tiếp tục sau ít phút."
          : `Google Drive trả về lỗi ${status}.`);
  }
}

async function drivePost(token: DriveToken, url: string, body: BodyInit, contentType: string, signal: AbortSignal) {
  if (Date.now() >= token.expiresAt) throw new LessonCheckDriveError(401);
  const response = await fetch(url, {
    method: "POST", signal, body,
    headers: { Authorization: `Bearer ${token.value}`, "Content-Type": contentType },
  });
  if (!response.ok) throw new LessonCheckDriveError(response.status);
  return response;
}

async function driveFileId(response: Response) {
  const { id } = await response.json();
  if (typeof id !== "string" || !/^[\w-]+$/.test(id)) throw Error("Drive chưa trả về mã tệp hợp lệ.");
  return id;
}

export async function createLessonCheckFolder(token: DriveToken, name: string, signal: AbortSignal) {
  const response = await drivePost(token, `${driveApi}/files?fields=id`, JSON.stringify({
    name, mimeType: "application/vnd.google-apps.folder",
  }), "application/json", signal);
  return driveFileId(response);
}

export async function uploadLessonCheckDoc(token: DriveToken, folder: string, name: string, bytes: Uint8Array, signal: AbortSignal) {
  const boundary = `mathcos_${crypto.randomUUID()}`;
  const metadata = JSON.stringify({ name, mimeType: googleDoc, parents: [folder], writersCanShare: false });
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`,
    `--${boundary}\r\nContent-Type: ${examWordMime}\r\n\r\n`,
    bytes.slice().buffer,
    `\r\n--${boundary}--\r\n`,
  ]);
  const response = await drivePost(token, "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id",
    body, `multipart/related; boundary=${boundary}`, signal);
  return driveFileId(response);
}

export async function shareLessonCheckDoc(token: DriveToken, id: string, mode: DriveSharing, email: string, signal: AbortSignal) {
  const permission = mode === "email" ? { type: "user", role: "writer", emailAddress: email }
    : { type: "anyone", role: "writer", allowFileDiscovery: false };
  const query = mode === "email" ? "?sendNotificationEmail=false" : "";
  await drivePost(token, `${driveApi}/files/${encodeURIComponent(id)}/permissions${query}`, JSON.stringify(permission), "application/json", signal);
}
