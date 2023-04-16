/** @format */
import { WebClient } from "@slack/web-api";
import { createIssue } from "./createIssue.js";
import { appendProgressComment } from "./appendProgressComment.js";
import { closeIssue } from "./closeIssue.js";
import { postSlackMessage } from "./postSlackMessage.js";
import { slackRequestBody } from "./slackRequestBody.js";
import { getAction } from "./getAction.js";

const slackClient = new WebClient(process.env.SLACK_BOT_TOKEN);

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
  // slackのリクエスト情報
  const { thread_ts, user, channel, ts } = slackRequestBody(body);

  if (!ts) {
    console.info("スレッドではないところで発言された");
    await postSlackMessage(channel, null, "チャンネルのログを参照することはできないため、呼び出しはスレッドの中で行ってください :robot_face: :sweat_drops: ");
    return { statusCode: 200, body: JSON.stringify({ success: true }) };
  }

  const action = await getAction(text);

  // スレッドのリプライ
  const replies = await slackClient.conversations.replies({
    token: process.env.SLACK_BOT_TOKEN,
    channel: channel,
    ts: ts,
    inclusive: true,
  });

  const slackPost = await postSlackMessage(channel, thread_ts, "処理中です :robot_face: :hourglass_flowing_sand:");
  if (typeof slackPost === "undefined") {
    await postSlackMessage(channel, thread_ts, "処理に失敗しました :robot_face: :fire: ");
    return { statusCode: 200, body: JSON.stringify({ success: true }) };
  }

  try {
    // textに「起票」という文字が含まれているか
    if (action.includes("起票")) {
      console.info("新規issueを作成する");
      // slackのスレッドのURL
      const chatGetPermalinkArguments = await slackClient.chat.getPermalink({
        channel: channel,
        message_ts: ts,
      });
      const slackThreadUrl = chatGetPermalinkArguments.permalink;

      const issueUrl = await createIssue(thread_ts, replies, channel, ts, slackThreadUrl);
      await slackClient.chat.update({
        as_user: true,
        channel: channel,
        ts: slackPost.ts,
        text: `起票しました ${issueUrl}`,
      });
    }
    // textに「経過」もしくは「記録」の文字が含まれているか
    else if (action.includes("記録")) {
      console.info("経過記録を作成する");
      const commentUrl = await appendProgressComment(thread_ts, replies, channel, ts);
      // 起票に成功したらメッセージを更新する
      await slackClient.chat.update({
        as_user: true,
        channel: channel,
        ts: slackPost.ts,
        text: `経過記録しました ${commentUrl}`,
      });
    }
    // textに「完了」という文字が含まれているか
    else if (action.includes("終了")) {
      console.info("完了コメントを作成する");
      const commentUrl = await closeIssue(thread_ts, replies, channel, ts);
      await slackClient.chat.update({
        as_user: true,
        channel: channel,
        ts: slackPost.ts,
        text: `課題を完了しました！👏✨ ${commentUrl}`,
      });
    } else {
      await postSlackMessage(channel, thread_ts, "行いたい操作を判別できませんでした。 :robot_face: :sweat_drops: \n `起票` `記録` `終了` のいずれかを含むメッセージを送信してください。");
    }
  } catch (error) {
    console.error(error);
    await postSlackMessage(channel, thread_ts, "処理に失敗しました :robot_face: :fire: ");
  }

  return { statusCode: 200, body: JSON.stringify({ success: true }) };
};
