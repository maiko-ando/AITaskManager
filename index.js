/** @format */
import { WebClient } from "@slack/web-api";
import { createIssue } from "./createIssue.js";
import { appendProgressComment } from "./appendProgressComment.js";
import { closeIssue } from "./closeIssue.js";
import { summarizeIssue } from "./summarizeIssue.js";
import { postSlackMessage } from "./postSlackMessage.js";
import { slackRequestBody } from "./slackRequestBody.js";
import { getAction } from "./getAction.js";

import { getSlackUserName } from "./getSlackUserName.js";

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
  // 関数実行時にユーザIDとユーザ名を紐付けるための記録用
  const userNames = {};
  // スレッドのリプライ
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

    // message.text中に<@U01XXXXXXX>のような形式でユーザIDが含まれている場合、
    // ユーザIDをユーザ名に置換する。@ユーザー名の形式にする
    const messageText = message.text.replace(/<@.*>/g, (match) => {
      const userId = match.replace(/<|>|@/g, "");
      return `@${userNames[userId]}`;
    });

    // 発言内容にBOTへのメンションが含まれる場合はスキップする
    if (messageText.includes(`@${process.env.BOT_NAME}`)) {
      return;
    }
    if (messageText.includes(`@undefined`)) {
      return;
    }
    if (userName === process.env.BOT_NAME) {
      return;
    }

    return `${userName}: ${messageText}`;
  });
  const messagesString = await Promise.all(messages);
  // messagesStringを改行コードで連結して1つの文字列にする
  const conversation = messagesString.join("\n");
  console.log({ conversation });

  const slackPost = await postSlackMessage(channel, thread_ts, "処理中です :robot_face: :hourglass_flowing_sand:");
  if (typeof slackPost === "undefined") {
    await postSlackMessage(channel, thread_ts, "処理に失敗しました :robot_face: :fire: ");
    return { statusCode: 200, body: JSON.stringify({ success: true }) };
  }

  // slackのスレッドのURL
  const chatGetPermalinkArguments = await slackClient.chat.getPermalink({
    channel: channel,
    message_ts: ts,
  });
  const slackThreadUrl = chatGetPermalinkArguments.permalink;

  try {
    // textに「起票」という文字が含まれているか
    if (action.includes("起票")) {
      console.info("新規issueを作成する");

      const issueUrl = await createIssue(thread_ts, replies, channel, ts, slackThreadUrl, conversation);
      if (issueUrl) {
        await slackClient.chat.update({
          as_user: true,
          channel: channel,
          ts: slackPost.ts,
          text: `起票しました ${issueUrl}`,
        });
      }
    }
    // textに「経過」もしくは「記録」の文字が含まれているか
    else if (action.includes("記録")) {
      console.info("経過記録を作成する");
      const commentUrl = await appendProgressComment(thread_ts, replies, channel, ts, conversation);

      if (commentUrl) {
        // 起票に成功したらメッセージを更新する
        await slackClient.chat.update({
          as_user: true,
          channel: channel,
          ts: slackPost.ts,
          text: `経過記録しました ${commentUrl}`,
        });
      }
    }
    // textに「まとめ」が含まれているか
    else if (action.includes("まとめ")) {
      console.info("まとめたissueを作成する");
      const { issueUrl, commentUrl } = await summarizeIssue(thread_ts, replies, channel, ts, slackThreadUrl, conversation);
      if (issueUrl) {
        // 起票に成功したらメッセージを更新する
        await slackClient.chat.update({
          as_user: true,
          channel: channel,
          ts: slackPost.ts,
          text: `起票しました ${issueUrl} \nタスクの経緯を纏めて記録しています`,
        });
      } else {
        //
        await slackClient.chat.update({
          as_user: true,
          channel: channel,
          ts: slackPost.ts,
          text: `起票されている課題の経緯をまとめました ${commentUrl} \n`,
        });
      }
    }
    // textに「完了」という文字が含まれているか
    else if (action.includes("終了")) {
      console.info("完了コメントを作成する");
      const commentUrl = await closeIssue(thread_ts, replies, channel, ts, conversation);
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
