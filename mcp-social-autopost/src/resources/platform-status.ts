import { listPlatformsTool } from "../tools/list-platforms.js";
import { listPublicationHistory } from "../utils/content.js";

export async function getPlatformStatusResource(): Promise<string> {
  return listPlatformsTool({});
}

export async function getHistoryResource(): Promise<string> {
  const history = await listPublicationHistory();
  return JSON.stringify(
    {
      count: history.length,
      items: history,
    },
    null,
    2,
  );
}
