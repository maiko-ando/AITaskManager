export const slackRequestBody = (requestBody) => {

    const thread_ts = requestBody.event.thread_ts || requestBody.event.ts;
    const user = requestBody.event.user;
    const channel = requestBody.event.channel;
    const ts = requestBody.event.thread_ts;

    return {
        thread_ts,
        user,
        channel,
        ts
    }
}
