/** @format */
import { WebClient } from "@slack/web-api";
import { createIssue as createIssueGithub } from "./github/createIssue.js";
import { appendProgressComment as appendProgressCommentGithub } from "./github/appendProgressComment.js";
import { closeIssue as closeIssueGithub } from "./github/closeIssue.js";
import { summarizeIssue as summarizeIssueGithub } from "./github/summarizeIssue.js";
import { postSlackMessage } from "./postSlackMessage.js";
import { slackRequestBody } from "./slackRequestBody.js";
import { getAction } from "./getAction.js";
import { getSlackUserName } from "./getSlackUserName.js";

const slackClient = new WebClient(process.env.SLACK_BOT_TOKEN);

export const handler = async (event) => {
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
  try {
    return await main(body, text);
  } catch (error) {
    const { channel } = slackRequestBody(body);
    await postSlackMessage(
      channel,
      null,
      `:warning: エラーが発生しました。以下の内容を確認してください。
\`\`\`
${error.message}
\`\`\`
`
    );
  }
  return { statusCode: 200, body: JSON.stringify({ success: true }) };
};

// bodyを受け取って処理を開始する
export const main = async (body, text) => {
  console.info({ text }, { body });

  let thread_ts = null;
  let channel = null;
  let ts = null;
  // slackのリクエスト情報
  try {
    const _slackRequestBody = slackRequestBody(body);
    thread_ts = _slackRequestBody.thread_ts;
    channel = _slackRequestBody.channel;
    ts = _slackRequestBody.ts;
  } catch (error) {
    throw new Error("Slackのリクエスト情報の取得に失敗しました。");
  }

  if (!ts) {
    console.info("スレッドではないところで発言された");
    await postSlackMessage(channel, null, "チャンネルのログを参照することはできないため、呼び出しはスレッドの中で行ってください :robot_face: :sweat_drops: ");
    return { statusCode: 200, body: JSON.stringify({ success: true, message: "スレッド外呼び出し" }) };
  }

  const action = await getAction(text);
  // Slackの関数実行時にユーザIDとユーザ名を紐付けるための記録用
  const userNames = {};
  // スレッドのリプライ
  const replies = await slackClient.conversations.replies({
    token: process.env.SLACK_BOT_TOKEN,
    channel: channel,
    ts: ts,
    inclusive: true,
  });

  console.log(replies);

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
    // 発言内容にundefinedへのメンションが含まれる場合はスキップする
    if (messageText.includes(`@undefined`)) {
      return;
    }
    // 発言者がBOTの場合はスキップする
    if (userName === process.env.BOT_NAME) {
      return;
    }

    return `${userName}: ${messageText}`;
  });

  const messagesString = await Promise.all(messages);
  // messagesStringを改行コードで連結して1つの文字列にする
  const conversation = messagesString.join("\n");
  console.log({ conversation });

  // slackのチャンネルのトピックの文章を取得
  const channelInfo = await slackClient.conversations.info({
    token: process.env.SLACK_BOT_TOKEN,
    channel: channel,
  });

  // タスク管理用ツールの名前を取得する
  // channelInfo.channel.topic.valueから [task:tool] に該当する箇所を抜き出す
  // 文章中に中括弧で括られたtoolが複数ある場合は最初の1つだけを抜き出す
  const channelTaskTool = channelInfo.channel.topic.value.match(/\[task:.*\]/)?.[0].replace(/\[task:|]/g, "");

  // channelInfo.channel.topic.valueから [repository:owner/repo] に該当する箇所を抜き出す
  // 文章中に中括弧で括られたowner/repoが複数ある場合は最初の1つだけを抜き出す
  const channelRepository = channelInfo.channel.topic.value.match(/\[repository:.*\]/)?.[0].replace(/\[repository:|]/g, "");

  // チャンネル名にリポジトリが含まれていない場合は環境変数のリポジトリ名を使用する
  const repository = channelRepository ? channelRepository : process.env.GITHUB_DEFAULT_REPO;

  // Slackに処理中のメッセージを投稿
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
    // 引数用オブジェクト
    const args = {
      thread_ts: thread_ts,
      replies: replies,
      channel: channel,
      ts: ts,
      slackThreadUrl: slackThreadUrl,
      conversation: conversation,
      repository: repository,
    };
    switch (channelTaskTool) {
      case "spreadsheet":
        {
          // スプレッドシートでの課題監理
          const spreadsheetId = channelInfo.channel.topic.value.match(/\[spreadsheet:.*\]/)?.[0].replace(/\[spreadsheet:|]/g, "");
          if (!spreadsheetId) {
            // スプレッドシートのIDが取得できない場合はエラーを返す
            await postSlackMessage(channel, thread_ts, "スプレッドシートのIDが取得できませんでした :robot_face: :fire: ");
            return { statusCode: 200, body: JSON.stringify({ success: true }) };
          }
        }
        break;

      default:
        console.log("github");
        // githubでの課題監理
        await issueManageForGithub(action, args, slackPost);
        break;
    }
  } catch (error) {
    console.error(error);
    await postSlackMessage(channel, thread_ts, "処理に失敗しました :robot_face: :fire: ");
  }
};

// githubでの課題監理
const issueManageForGithub = async (action, args, slackPost) => {
  const { channel, thread_ts } = args;
  // textに「起票」という文字が含まれているか
  if (action.includes("起票")) {
    console.info("新規issueを作成する");

    const issueUrl = await createIssueGithub(args);
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
    const commentUrl = await appendProgressCommentGithub(args);

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
    const { issueUrl, commentUrl } = await summarizeIssueGithub(args);
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
    const commentUrl = await closeIssueGithub(args);
    await slackClient.chat.update({
      as_user: true,
      channel: channel,
      ts: slackPost.ts,
      text: `課題を完了しました！👏✨ ${commentUrl}`,
    });
  } else {
    await postSlackMessage(channel, thread_ts, "行いたい操作を判別できませんでした。 :robot_face: :sweat_drops: \n `起票` `記録` `終了` のいずれかを含むメッセージを送信してください。");
  }
};
