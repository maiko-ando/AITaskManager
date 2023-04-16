/** @format */

import { WebClient } from "@slack/web-api";
const slackClient = new WebClient(process.env.SLACK_BOT_TOKEN);

// ユーザIDとユーザ名の紐付けの記録用
const userNames = {};
export const getSlackUserName = async (userId) => {
  if (!userNames[userId]) {
    const response = await slackClient.users.info({ user: userId });
    userNames[userId] = response.user.profile.display_name || response.user.profile.real_name;
  }
  // ユーザ名が取得できなかった場合は空文字を返す
  if (typeof userNames[userId] === "undefined") {
    userNames[userId] = "";
  }
  // ユーザー名の中にundefinedが含まれている場合は空文字を返す
  if (userNames[userId].includes("undefined")) {
    userNames[userId] = "";
  }

  return userNames[userId];
};
