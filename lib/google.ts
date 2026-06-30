import { google } from "googleapis";
import type { Credentials } from "google-auth-library";
import { decryptJson, encryptJson } from "@/lib/crypto";
import { googleEnv } from "@/lib/env";
import { prisma } from "@/lib/db";
import { naturalLessonSort } from "@/lib/utils";

export const DRIVE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/drive.readonly",
];

export const YOUTUBE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/youtube",
  "https://www.googleapis.com/auth/youtube.upload",
];

export type CourseVideo = {
  id: string;
  name: string;
  title: string;
  mimeType: string;
  size: string | null;
  moduleName: string | null;
  modulePath: string;
};

type TokenOwner = { id: string; encryptedTokens: string };

export function createOAuthClient(provider: "drive" | "youtube") {
  const env = googleEnv();
  return new google.auth.OAuth2(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    provider === "drive" ? env.GOOGLE_REDIRECT_URI_DRIVE : env.GOOGLE_REDIRECT_URI_YOUTUBE,
  );
}

export function googleAuthUrl(
  provider: "drive" | "youtube",
  state: string,
) {
  const client = createOAuthClient(provider);
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent select_account",
    include_granted_scopes: true,
    state,
    scope: provider === "drive" ? DRIVE_SCOPES : YOUTUBE_SCOPES,
  });
}

function bindRefreshPersistence(
  client: ReturnType<typeof createOAuthClient>,
  owner: TokenOwner,
  kind: "drive" | "youtube",
) {
  client.on("tokens", (fresh) => {
    void (async () => {
    const previous = decryptJson<Credentials>(owner.encryptedTokens);
    const merged = {
      ...previous,
      ...fresh,
      refresh_token: fresh.refresh_token ?? previous.refresh_token,
    };
    const data = { encryptedTokens: encryptJson(merged) };
    if (kind === "drive") {
      await prisma.googleDriveAccount.update({ where: { id: owner.id }, data });
    } else {
      await prisma.youtubeChannel.update({ where: { id: owner.id }, data });
    }
      owner.encryptedTokens = data.encryptedTokens;
    })().catch(() => undefined);
  });
}

export function driveClient(owner: TokenOwner) {
  const auth = createOAuthClient("drive");
  auth.setCredentials(decryptJson<Credentials>(owner.encryptedTokens));
  bindRefreshPersistence(auth, owner, "drive");
  return google.drive({ version: "v3", auth });
}

export function youtubeAuth(owner: TokenOwner) {
  const auth = createOAuthClient("youtube");
  auth.setCredentials(decryptJson<Credentials>(owner.encryptedTokens));
  bindRefreshPersistence(auth, owner, "youtube");
  return auth;
}

export function youtubeClient(owner: TokenOwner) {
  return google.youtube({ version: "v3", auth: youtubeAuth(owner) });
}

export async function listDriveFolder(owner: TokenOwner, parentId = "root") {
  const drive = driveClient(owner);
  const response = await drive.files.list({
    q: `'${parentId.replaceAll("'", "\\'")}' in parents and trashed = false`,
    fields: "files(id,name,mimeType,size,modifiedTime,webViewLink)",
    orderBy: "folder,name_natural",
    pageSize: 1000,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  const entries = response.data.files ?? [];
  return {
    folders: entries
      .filter((file) => file.mimeType === "application/vnd.google-apps.folder")
      .map((file) => ({
        id: file.id!,
        name: file.name || "Pasta sem nome",
        modifiedTime: file.modifiedTime ?? null,
      })),
    videos: naturalLessonSort(
      entries
        .filter((file) => isVideo(file.name || "", file.mimeType || ""))
        .map((file) => ({
          id: file.id!,
          name: file.name || "Vídeo sem nome",
          title: stripExtension(file.name || "Vídeo sem nome"),
          mimeType: file.mimeType || "application/octet-stream",
          size: file.size ?? null,
          moduleName: null,
          modulePath: "",
        })),
    ),
  };
}

export async function scanCourseFolder(owner: TokenOwner, rootId: string) {
  const drive = driveClient(owner);
  const root = await drive.files.get({
    fileId: rootId,
    fields: "id,name,mimeType",
    supportsAllDrives: true,
  });
  if (root.data.mimeType !== "application/vnd.google-apps.folder") {
    throw new Error("O item selecionado não é uma pasta.");
  }

  const videos: CourseVideo[] = [];
  const queue: Array<{ id: string; path: string[] }> = [{ id: rootId, path: [] }];

  while (queue.length) {
    const current = queue.shift()!;
    let pageToken: string | undefined;
    do {
      const response = await drive.files.list({
        q: `'${current.id.replaceAll("'", "\\'")}' in parents and trashed = false`,
        fields: "nextPageToken,files(id,name,mimeType,size)",
        pageSize: 1000,
        pageToken,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      });
      for (const file of response.data.files ?? []) {
        if (!file.id) continue;
        if (file.mimeType === "application/vnd.google-apps.folder") {
          queue.push({ id: file.id, path: [...current.path, file.name || "Módulo"] });
        } else if (isVideo(file.name || "", file.mimeType || "")) {
          const modulePath = current.path.join(" / ");
          videos.push({
            id: file.id,
            name: file.name || "Vídeo sem nome",
            title: stripExtension(file.name || "Vídeo sem nome"),
            mimeType: file.mimeType || "application/octet-stream",
            size: file.size ?? null,
            moduleName: current.path.at(-1) ?? null,
            modulePath,
          });
        }
      }
      pageToken = response.data.nextPageToken ?? undefined;
    } while (pageToken);
  }

  const grouped = new Map<string, CourseVideo[]>();
  for (const video of videos) {
    const list = grouped.get(video.modulePath) ?? [];
    list.push(video);
    grouped.set(video.modulePath, list);
  }

  return {
    folder: { id: root.data.id!, name: root.data.name || "Curso" },
    videos: [...grouped.entries()]
      .sort(([a], [b]) => a.localeCompare(b, "pt-BR", { numeric: true }))
      .flatMap(([, items]) => naturalLessonSort(items)),
  };
}

function stripExtension(name: string) {
  return name.replace(/\.(mp4|mov|avi|mkv|webm)$/i, "");
}

function isVideo(name: string, mimeType: string) {
  return (
    mimeType.startsWith("video/") ||
    /\.(mp4|mov|avi|mkv|webm)$/i.test(name)
  );
}
