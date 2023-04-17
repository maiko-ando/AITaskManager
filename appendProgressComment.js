/** @format */

import { Configuration, OpenAIApi } from "openai";
import { Octokit } from "@octokit/rest";

import { getSlackUserName } from "./getSlackUserName.js";
import { postSlackMessage } from "./postSlackMessage.js";

const openaiConfig = new Configuration({ apiKey: process.env.OPENAI_API_KEY });
const openaiClient = new OpenAIApi(openaiConfig);

// 関数実行時にユーザIDとユーザ名を紐付けるための記録用
const userNames = {};
// issueを作成する
export const appendProgressComment = async (thread_ts, replies, channel, ts, conversation) => {
  // 「起票しました https://github.com/xxxx/xxxx/issues/1」 のようなメッセージにマッチする正規表現
  const issueMessageRegex = /起票しました <https:\/\/github.com\/.*\/.*\/issues\/\d*>/;
  // 正規表現に当てはまるメッセージを取得する
  const issueMessage = replies.messages.find((message) => message.text.match(issueMessageRegex));

  // 起票しましたのメッセージが見つからない場合はSlackにメッセージを投稿して処理を終了する
  if (!issueMessage) {
    await postSlackMessage(channel, thread_ts, "起票しましたのメッセージが見つかりませんでした");
    return;
  }

  // メッセージに含まれるissueのURLを取得する
  const issueUrl = issueMessage.text.match(/<(.*)>/)[1];
  const commentText = await createProgressCommentDescription(conversation);

  // githubのissueにコメントを追加する
  const octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN,
  });
  // リポジトリ名を取得する
  const repository = process.env.GITHUB_DEFAULT_REPO; // リポジトリのオーナー名とリポジトリ名を/で区切った文字列
  // issueの番号を取得する
  const issueNumber = issueUrl.match(/issues\/(\d+)/)[1];
  // コメントを追加する
  const issueComment = await octokit.issues.createComment({
    owner: repository.split("/")[0],
    repo: repository.split("/")[1],
    issue_number: issueNumber,
    body: commentText,
  });

  // コメントのURLを取得する
  const commentUrl = issueComment.data.html_url;
  return commentUrl;
};

// 会話の内容からissueに記録用コメントを作成する
async function createProgressCommentDescription(conversation) {
  const prompt = `
これから以下のフォーマットで業務に関する会話の記録を渡します。

ーーー
・フォーマット
【発言者の名前】: 【発言内容】

・会話の記録
${conversation}
ーーー
${process.env.BOT_NAME}: 起票しました github.com/xxx/xxx/issues/xxx はチケットが作成されたときに自動的に記録されます。
${process.env.BOT_NAME}: 経過記録しました github.com/xxx/xxx/issues/xxx はチケットに作業経過がコメントされたときに自動的に記録されます。
これらが会話のログに含まれている場合は、それ以降の内容についての会話を踏まえて、
以下のようなフォーマットでタスクにコメントする文章を書いてください。
会話の内容から分からない部分は「不明」、特に存在しない場合は「特になし」として記載してください。
ーーー
## 現在の状況
【会話の内容から誰が何をしている状態かを記載。特になければ特記事項なしとして記載。】

## 追加された関係者
【会話の流れから追加で関係している人が発生していれば記載。特になければ特になしとして記載。】

## 追加で行うべき作業
【会話の流れから追加で行うべき作業が発生していれば記載。特になければ特になしとして記載。】

## 考慮すべき事項
【会話の流れから追加で考慮すべき事項が発生していれば記載。特になければ特になしとして記載。】
    `;

  try {
    const response = await openaiClient.createChatCompletion({
      model: "gpt-4",
      messages: [{ role: "user", content: prompt }],
    });
    console.log(response.data.choices[0].message?.content);
    return response.data.choices[0].message?.content;
  } catch (err) {
    console.error(err);
  }
}
