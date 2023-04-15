/** @format */

import { createIssue } from "./createIssue.js";
import { appendProgressComment } from "./appendProgressComment.js";
import { closeIssue } from "./closeIssue.js";
import { postSlackMessage } from "./postSlackMessage.js";

export const handler = async (event, context) => {
  console.info(event);

  try {
    // event.headers['x-slack-retry-num']があれば、Slackからの再送信なので処理をスキップ
    if (event.headers["x-slack-retry-num"]) {
      return { statusCode: 200, body: JSON.stringify({ message: "No need to resend" }) };
    }
  } catch (error) {
    // headerに当該パラメータがない場合のエラー停止を防ぐためにtry-catchで囲む
  }

  const body = JSON.parse(event.body);
  const text = body.event.text.replace(/<@.*>/g, "");

  console.info({ text }, { body });

  // textに「起票」という文字が含まれているか
  if (text.includes("起票")) {
    console.info("新規issueを作成する");
    await createIssue(body);
  }
  // textに「経過」もしくは「記録」の文字が含まれているか
  else if (text.includes("経過") || text.includes("記録")) {
    console.info("経過記録を作成する");
    await appendProgressComment(body);
  }
  // textに「完了」という文字が含まれているか
  else if (text.includes("完了")) {
    console.info("完了コメントを作成する");
    await closeIssue(body);
  }

  return { statusCode: 200, body: JSON.stringify({ success: true }) };
};

// // issueをクローズする
// async function closeIssue(body) {
//   const thread_ts = body.event.thread_ts || body.event.ts;
//   const user = body.event.user;
//   const channel = body.event.channel;
//   const ts = body.event.thread_ts;
//   const replies = await slackClient.conversations.replies({
//     token: process.env.SLACK_BOT_TOKEN,
//     channel: channel,
//     ts: ts,
//     inclusive: true,
//   });

//   // 起票しましたのメッセージを取得する
//   const issueMessage = replies.messages.find((message) => message.text.includes("起票しました"));

//   // 起票しましたのメッセージが見つからない場合はSlackにメッセージを投稿して処理を終了する
//   if (!issueMessage) {
//     await postSlackMessage(body.event.channel, thread_ts, "起票しましたのメッセージが見つかりませんでした");
//     return;
//   }

//   // メッセージに含まれるissueのURLを取得する
//   const issueUrl = issueMessage.text.match(/<(.*)>/)[1];

//   // githubのissueをクローズする
//   const octokit = new Octokit({
//     auth: process.env.GITHUB_TOKEN,
//   });
//   // リポジトリ名を取得する
//   const repository = process.env.GITHUB_DEFAULT_REPO; // リポジトリのオーナー名とリポジトリ名を/で区切った文字列
//   // issueの番号を取得する
//   const issueNumber = issueUrl.match(/issues\/(\d+)/)[1];
//   // issueをクローズする
//   await octokit.issues.update({
//     owner: repository.split("/")[0],
//     repo: repository.split("/")[1],
//     issue_number: issueNumber,
//     state: "closed",
//   });

//   // slackにメッセージを投稿する
//   await postSlackMessage(body.event.channel, thread_ts, "課題を完了しました！👏✨");
//   return;
// }
