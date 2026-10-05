import qingdaoSea from "./demo-photos/qingdao-sea.svg" with { type: "text" };
import xiamenProposal from "./demo-photos/xiamen-proposal.svg" with { type: "text" };
import xianWall from "./demo-photos/xian-wall.svg" with { type: "text" };

/** Must match the local SDK message thrown when `generate_media` is not implemented. */
export const imageGenerationUnavailableMessage = "示例照片需要 Hatch 的 generate_media。这个环境没有图像生成。";

export type DemoArt = "qingdao-sea" | "xiamen-proposal" | "xian-wall";

const drawings: Record<DemoArt, string> = {
  "qingdao-sea": qingdaoSea,
  "xiamen-proposal": xiamenProposal,
  "xian-wall": xianWall,
};

export function isImageGenerationUnavailable(error: unknown): boolean {
  return error instanceof Error && error.message === imageGenerationUnavailableMessage;
}

export function placeholderPhoto(art: DemoArt): { bytes: Uint8Array; contentType: "image/svg+xml"; extension: "svg" } {
  return { bytes: new TextEncoder().encode(drawings[art]), contentType: "image/svg+xml", extension: "svg" };
}
