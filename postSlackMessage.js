/** @format */

import { WebClient } from "@slack/web-api";
const slackClient = new WebClient(process.env.SLACK_BOT_TOKEN);

export const postSlackMessage = async (channel, thread_ts, text) => {
  try {
    let payload = {
      channel: channel,
      text: text,
      as_user: true,
    };

    if (thread_ts) {
      payload["thread_ts"] = thread_ts;
    }
    await slackClient.chat.postMessage(payload);
  } catch (err) {
    console.error(err);
  }
};
