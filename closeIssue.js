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
export const closeIssue = async (requestBody) => {
  const { thread_ts, user, channel, ts } = slackRequestBody(requestBody);

  const replies = await slackClient.conversations.replies({
    token: process.env.SLACK_BOT_TOKEN,
    channel: channel,
    ts: ts,
    inclusive: true,
  });

  // 起票しましたのメッセージを取得する
  const issueMessage = replies.messages.find((message) => message.text.includes("起票しました"));

  // 起票しましたのメッセージが見つからない場合はSlackにメッセージを投稿して処理を終了する
  if (!issueMessage) {
    await postSlackMessage(channel, thread_ts, "起票しましたのメッセージが見つかりませんでした");
    return;
  }

  // メッセージに含まれるissueのURLを取得する
  const issueUrl = issueMessage.text.match(/<(.*)>/)[1];

  // 会話の履歴を取得する
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

  const commentText = await createCloseCommentDescription(conversation);

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

  // issueをクローズする
  await octokit.issues.update({
    owner: repository.split("/")[0],
    repo: repository.split("/")[1],
    issue_number: issueNumber,
    state: "closed",
  });

  // コメントのURLを取得する
  const commentUrl = issueComment.data.html_url;

  // slackにメッセージを投稿する
  await postSlackMessage(channel, thread_ts, `課題を完了しました！👏✨ ${commentUrl}`);
  return;
};

// 会話の内容からissueに記録用コメントを作成する
async function createCloseCommentDescription(conversation) {
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
これらが会話のログに含まれている場合は、それらを無視し、
以下のようなフォーマットでタスクが終了に至った一連の流れをまとめてください。
会話の内容から分からない部分は「不明」、特に存在しない場合は「特になし」として記載してください。

ーーー
## 終了の経緯
【会話の内容から終了に至った経緯を記載。】

## 記録事項
【会話の流れからタスクとして解決しなかったことや懸念すべき事項などあれば記載。特に存在しない場合は特になしと記載。】
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
