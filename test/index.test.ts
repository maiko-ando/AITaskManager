/** @format */

import { main } from "../src/index.js";
import { test, expect } from "vitest";

test("Slackからのリクエスト情報の取得に失敗した場合", async () => {
  try {
    const slackRequestBodyJson = {};
    await main(slackRequestBodyJson, "");
  } catch (error) {
    expect(error.message).toBe("Slackのリクエスト情報の取得に失敗しました。");
  }
});

test("スレッド外呼び出し", async () => {
  const slackRequestBodyJson = {
    token: "y1ifUcp5GuZ4oCXXZdiyXt5L",
    team_id: "T053S69RLG1",
    api_app_id: "A0536V956H4",
    event: {
      client_msg_id: "91efa8ca-0e11-42e5-882e-ee71ed34cd05",
      type: "app_mention",
      text: "<@U053G5TKD0U> \\u30c6\\u30b9\\u30c8",
      user: "U053DHDGBGA",
      // ts: "1681908777.619219",
      blocks: [
        {
          type: "rich_text",
          block_id: "Bsb",
          elements: [
            {
              type: "rich_text_section",
              elements: [
                { type: "user", user_id: "U053G5TKD0U" },
                { type: "text", text: " \\u30c6\\u30b9\\u30c8" },
              ],
            },
          ],
        },
      ],
      team: "T053S69RLG1",
      channel: "C053HQ1BC1L",
      event_ts: "1681908777.619219",
    },
    type: "event_callback",
    event_id: "Ev053YKB4ZS7",
    event_time: 1681908777,
    authorizations: [{ enterprise_id: null, team_id: "T053S69RLG1", user_id: "U053G5TKD0U", is_bot: true, is_enterprise_install: false }],
    is_ext_shared_channel: false,
    event_context: "4-eyJldCI6ImFwcF9tZW50aW9uIiwidGlkIjoiVDA1M1M2OVJMRzEiLCJhaWQiOiJBMDUzNlY5NTZINCIsImNpZCI6IkMwNTNIUTFCQzFMIn0",
  };
  const response = await main(slackRequestBodyJson, "");
  const responseBody = JSON.parse(response.body);
  expect(responseBody.message).toBe("スレッド外呼び出し");
});
