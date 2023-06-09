/** @format */

import { Configuration, OpenAIApi } from "openai";
import { Octokit } from "@octokit/rest";
import { appendProgressComment } from "./appendProgressComment.js";

const openaiConfig = new Configuration({ apiKey: process.env.OPENAI_API_KEY });
const openaiClient = new OpenAIApi(openaiConfig);

// 経緯をまとめたissueを作成する
export const summarizeIssue = async ({ thread_ts, replies, channel, ts, slackThreadUrl, conversation, repository }) => {
  // 「起票しました https://github.com/xxxx/xxxx/issues/1」 のようなメッセージにマッチする正規表現
  const issueMessageRegex = /起票しました <https:\/\/github.com\/.*\/.*\/issues\/\d*>/;
  // 正規表現に当てはまるメッセージを取得する
  const issueMessage = replies.messages.find((message) => message.text.match(issueMessageRegex));

  // 起票しましたのメッセージが見つかった場合はissueの終了を行う
  if (issueMessage) {
    const commentUrl = await appendProgressComment({ thread_ts, replies, channel, ts, slackThreadUrl, conversation, repository });
    return { commentUrl };
  }

  const openaiResponse = await createIssueDescription(conversation);

  // 作成したタスクの内容をgithubのissueに登録する
  const octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN,
  });
  // タイトルを取得する
  const title = openaiResponse.match(/# (.*)/)[1];
  // ボディを取得する
  // ボディの内容に「, undefined」が含まれている場合は削除する
  const taskBody = openaiResponse.replace(/# (.*)/, "").replace(/, undefined/g, "");

  // オーナー名
  const owner = repository.split("/")[0];
  // リポジトリ名
  const repo = repository.split("/")[1];

  const appendSlackUrlBody = `
${taskBody}

## 起票元のSlackスレッド
${slackThreadUrl}
  `;

  // issueを作成する
  const issue = await octokit.issues.create({
    owner: owner,
    repo: repo,
    title: title,
    body: appendSlackUrlBody,
  });

  // ラベルを取得する
  const label = taskBody
    .match(/## 課題の関係者\n(.*)/)[1]
    .split("\n")
    // @と空文字を削除する
    .map((label) => label.replace(/@/, "").replace(/ /g, ""))
    .join("");

  // 句読点でlabelを分割する（担当者名をラベルにする）
  const labels = label.split(",");

  // labelsに空文字列が含まれている場合は削除する
  labels.filter((label) => label !== "");

  // issueにラベルを複数設定する
  await octokit.issues.addLabels({
    owner: owner,
    repo: repo,
    issue_number: issue.data.number,
    labels: labels,
  });

  // issueをクローズする
  await octokit.issues.update({
    owner: owner,
    repo: repo,
    issue_number: issue.data.number,
    state: "closed",
  });

  // issueのURLを取得する
  const issueUrl = issue.data.html_url;
  return { issueUrl };
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

以上の会話を踏まえて、以下のようなフォーマットでタスクに記録する文章を書いてください。
会話の内容から分からない部分は「不明」、特に存在しない場合は「特になし」として記載してください。

ーーー
# 【このタスクにつけるべきタイトル】

## 課題の関係者
【この部分に会話の記録からこの課題に関係している人を半角のカンマ区切りで記載】

## 課題の経緯
【会話の内容から課題が発生した経緯を記載。】

## 行われた作業
【タスクを実行するために行われた作業を箇条書きで記載。】

## 現在の状況
【会話の内容から誰が何をした状態かを記載。特になければ特記事項なしとして記載。】

## 記録事項
【会話の流れからタスクとして解決しなかったことや懸念すべき事項などあれば記載。特に存在しない場合は特になしと記載。】
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
