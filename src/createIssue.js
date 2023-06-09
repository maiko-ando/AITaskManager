/** @format */

import { Configuration, OpenAIApi } from "openai";
import { Octokit } from "@octokit/rest";
import { postSlackMessage } from "./postSlackMessage.js";

const openaiConfig = new Configuration({ apiKey: process.env.OPENAI_API_KEY });
const openaiClient = new OpenAIApi(openaiConfig);

// issueを作成する
export const createIssue = async ({ thread_ts, replies, channel, slackThreadUrl, conversation, repository }) => {
  // 「起票しました https://github.com/xxxx/xxxx/issues/1」 のようなメッセージにマッチする正規表現
  const issueMessageRegex = /起票しました <https:\/\/github.com\/.*\/.*\/issues\/\d*>/;
  // 正規表現に当てはまるメッセージを取得する
  const issueMessage = replies.messages.find((message) => message.text.match(issueMessageRegex));

  // 起票しましたのメッセージが見つかった場合はSlackにメッセージを投稿して処理を終了する
  if (issueMessage) {
    // メッセージに含まれるissueのURLを取得する
    const issueUrl = issueMessage.text.match(/<(.*)>/)[1];
    await postSlackMessage(channel, thread_ts, `このスレッドではすでに起票が行われています。${issueUrl}`);
    return;
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

  // issueのURLを取得する
  const issueUrl = issue.data.html_url;
  return issueUrl;
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
