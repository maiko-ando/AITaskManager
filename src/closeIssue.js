/** @format */

import { Configuration, OpenAIApi } from "openai";
import { Octokit } from "@octokit/rest";
import { postSlackMessage } from "./postSlackMessage.js";

const openaiConfig = new Configuration({ apiKey: process.env.OPENAI_API_KEY });
const openaiClient = new OpenAIApi(openaiConfig);

// issueを作成する
export const closeIssue = async ({ thread_ts, replies, channel, conversation, repository }) => {
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

  const commentText = await createCloseCommentDescription(conversation);

  // githubのissueにコメントを追加する
  const octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN,
  });
  // オーナー名
  const owner = repository.split("/")[0];
  // リポジトリ名
  const repo = repository.split("/")[1];
  // issueの番号を取得する
  const issueNumber = issueUrl.match(/issues\/(\d+)/)[1];
  // コメントを追加する
  const issueComment = await octokit.issues.createComment({
    owner: owner,
    repo: repo,
    issue_number: issueNumber,
    body: commentText,
  });

  // issueをクローズする
  await octokit.issues.update({
    owner: owner,
    repo: repo,
    issue_number: issueNumber,
    state: "closed",
  });

  // コメントのURLを取得する
  const commentUrl = issueComment.data.html_url;
  return commentUrl;
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
