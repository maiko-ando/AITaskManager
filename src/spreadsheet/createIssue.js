/** @format */

import { Octokit } from "@octokit/rest";
import { postSlackMessage } from "../postSlackMessage.js";

import { Configuration, OpenAIApi } from "openai";
const openaiConfig = new Configuration({ apiKey: process.env.OPENAI_API_KEY });
const openaiClient = new OpenAIApi(openaiConfig);

// gapiのインポート
import { google } from "googleapis";

// spreadsheetにissue行を作成する;
export const createIssue = async ({ thread_ts, replies, channel, slackThreadUrl, conversation, sheetId }) => {
  authorize().then(listMajors).catch(console.error);
  // // sheetIdからスプレッドシートを取得する
  // const sheet = SpreadsheetApp.openById(sheetId);

  // // シートのtaskのシートを取得する
  // const taskSheet = sheet.getSheetByName("task");

  // // taskのシートの最終行を取得する
  // const lastRow = taskSheet.getLastRow();

  // // taskのシートの最終行の次の行を取得する
  // const nextRow = lastRow + 1;

  // // A列にthread_tsを設定する
  // taskSheet.getRange(nextRow, 1).setValue(thread_ts);

  // // 書き込みをした行の番号を返す
  // return nextRow;
};

(async () => {
  await createIssue({});
})();

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];

/**
 * Reads previously authorized credentials from the save file.
 *
 * @return {Promise<OAuth2Client|null>}
 */
async function loadSavedCredentialsIfExist() {
  try {
    const credentials = {
      type: "authorized_user",
      client_id: "259944435305-3rda96r6c73mfbidovecpm6u7rimgf75.apps.googleusercontent.com",
      client_secret: "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",
      refresh_token: "1//0eFP42osDWVG8CgYIARAAGA4SNwF-L9IrvMebVAHH5-qtBVkCGKnWrPfZK4IRKnb_JtLOxxVzveoNCqfVHhig-DyNXZrhaGZ9o4E",
    };
    return google.auth.fromJSON(credentials);
  } catch (err) {
    return null;
  }
}

/**
 * @param {google.auth.OAuth2} auth The authenticated Google OAuth client.
 */
async function listMajors(auth) {
  const sheets = google.sheets({ version: "v4", auth });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: "15x7lDDuRsf_J_5zAqfX6I4o6gqVkcrWotEVmpVkxqjI",
    range: "task!A2:E",
  });
  const rows = res.data.values;
  if (!rows || rows.length === 0) {
    console.log("No data found.");
    return;
  }

  // 最終行を取得する
  const lastRow = rows.length;

  // 最終行の次の行を取得する
  const nextRow = lastRow + 1;

  console.log("Name, Major:");
  rows.forEach((row) => {
    // Print columns A and E, which correspond to indices 0 and 4.
    console.log(`${row[0]}, ${row[4]}`);
  });
  const values = { values: [["test"]] };
  // A列にthread_tsを設定する
  await sheets.spreadsheets.values.update({
    spreadsheetId: "15x7lDDuRsf_J_5zAqfX6I4o6gqVkcrWotEVmpVkxqjI",
    range: `task!A${nextRow}`,
    valueInputOption: "RAW",
    resource: values,
  });
}
/**
 * Load or request or authorization to call APIs.
 *
 */
async function authorize() {
  let client = await loadSavedCredentialsIfExist();
  return client;
}

// 会話の内容からgithubのissueの概要分を作成する
async function createIssueDescription(conversation) {
  const prompt = `
これから以下のフォーマットで業務に関する会話の記録を渡します。

ーーー
・フォーマット
【発言者の名前】: 【発言内容】

・会話の記録
${conversation}
ーーー

以上の会話を踏まえて、以下のようなフォーマットでタスクを起票する文章を書いてください。
会話の内容から分からない部分は「不明」、特に存在しない場合は「特になし」として記載してください。

ーーー
# 【このタスクにつけるべきタイトル】

## 課題の関係者
【この部分に会話の記録からこの課題に関係している人を半角のカンマ区切りで記載】

## 行うべき作業
【タスクを実行するために行うべき作業をマークダウンの箇条書きで記載。行頭にチェックボックスを付与する。】

## 考慮すべき事項
【タスクを実行するために考慮するべき事項を箇条書きで記載。特になければこの項目は不要】

## 現在の状況
【会話の内容から誰が何をしている状態かを記載。特になければ特記事項なしとして記載。】

## 期限
【会話の内容からいつまでに行うべきか判断できれば記載。判断できなければ未定として記載。】
`;

  try {
    const response = await openaiClient.createChatCompletion({
      model: "gpt-4",
      messages: [{ role: "user", content: prompt }],
    });
    return response.data.choices[0].message?.content;
  } catch (err) {
    console.error(err);
  }
}
