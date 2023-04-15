/** @format */

import { WebClient } from "@slack/web-api";
import { Configuration, OpenAIApi } from "openai";
import { Octokit } from "@octokit/rest";

import { slackRequestBody } from "./slackRequestBody.js";
import { getSlackUserName } from "./getSlackUserName.js";
import { postSlackMessage } from "./postSlackMessage.js";

const slackClient = new WebClient(process.env.SLACK_BOT_TOKEN);
const openaiConfig = new Configuration({ apiKey: process.env.OPENAI_API_KEY });
const openaiClient = new OpenAIApi(openaiConfig);

// 関数実行時にユーザIDとユーザ名を紐付けるための記録用
const userNames = {};
// issueを作成する
export const createIssue = async (requestBody) => {
  const { thread_ts, user, channel, ts } = slackRequestBody(requestBody);

  const replies = await slackClient.conversations.replies({
    token: process.env.SLACK_BOT_TOKEN,
    channel: channel,
    ts: ts,
    inclusive: true,
  });

  // スレッドから会話した内容の文字列を作成する
  // userのIDから表示名を取得し、表示名: 会話内容の形式で文字列を作成する
  const messages = replies.messages.map(async (message) => {
    const userName = await getSlackUserName(message.user);
    userNames[message.user] = userName;

    // userNameがBOTの名前の場合はスキップする
    if (userName === process.env.BOT_NAME) {
      return;
    }
    // message.text中に<@U01XXXXXXX>のような形式でユーザIDが含まれている場合、
    // ユーザIDをユーザ名に置換する。@ユーザー名の形式にする
    const messageText = message.text.replace(/<@.*>/g, (match) => {
      const userId = match.replace(/<|>|@/g, "");
      return `@${userNames[userId]}`;
    });

    return `${userName}: ${messageText}`;
  });
  const messagesString = await Promise.all(messages);
  // messagesStringを改行コードで連結して1つの文字列にする
  const conversation = messagesString.join("\n");
  const openaiResponse = await createIssueDescription(conversation);

  // 作成したタスクの内容をgithubのissueに登録する
  const octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN,
  });
  // リポジトリ名を取得する
  const repository = process.env.GITHUB_DEFAULT_REPO; // リポジトリのオーナー名とリポジトリ名を/で区切った文字列
  // タイトルを取得する
  const title = openaiResponse.match(/# (.*)/)[1];
  // ボディを取得する
  const taskBody = openaiResponse.replace(/# (.*)/, "");

  // オーナー名
  const owner = repository.split("/")[0];
  // リポジトリ名
  const repo = repository.split("/")[1];

  // issueを作成する
  const issue = await octokit.issues.create({
    owner: owner,
    repo: repo,
    title: title,
    body: taskBody,
  });

  // ラベルを取得する
  const label = taskBody
    .match(/## 課題の関係者\n(.*)/)[1]
    .split("\n")
    .map((label) => label.replace(/@/, ""))
    .join("");
  // 句読点でlabelを分割する（担当者名をラベルにする）
  const labels = label.split(",");

  console.log({ labels });

  // issueにラベルを複数設定する
  await octokit.issues.addLabels({
    owner: owner,
    repo: repo,
    issue_number: issue.data.number,
    labels: labels,
  });

  // issueのURLを取得する
  const issueUrl = issue.data.html_url;
  // issueのURLをSlackに投稿する
  await postSlackMessage(channel, thread_ts, `起票しました ${issueUrl}`);

  console.log(openaiResponse);
  return openaiResponse;
};

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
