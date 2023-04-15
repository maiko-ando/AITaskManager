import { WebClient } from '@slack/web-api';
const slackClient = new WebClient(process.env.SLACK_BOT_TOKEN);

// ユーザIDとユーザ名の紐付けの記録用
const userNames = {};
export const getSlackUserName = async (userId) => {
    if (!userNames[userId]) {
        const response = await slackClient.users.info({ user: userId });
        userNames[userId] = response.user.profile.display_name || response.user.profile.real_name;
    }
    return userNames[userId];
}

