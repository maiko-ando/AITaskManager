/** @format */
import { Configuration, OpenAIApi } from "openai";
const openaiConfig = new Configuration({ apiKey: process.env.OPENAI_API_KEY });
const openaiClient = new OpenAIApi(openaiConfig);

// ユーザーの発言内容から、何をしてほしいか類推して行うべき内容を返す
export const getAction = async (text) => {
  return await judgeCommand(text);
};

// 会話の内容からgithubのissueの概要分を作成する
async function judgeCommand(conversation) {
  const prompt = `
以下の発言は下記3つのコマンドのどれかに当てはまるか判断してください。
・「起票」：課題を作成したい
・「記録」：課題に記録用のコメントをしたい
・「終了」：課題をクローズしたい

ーーー
${conversation}
ーーー
判断ができたら、そのコマンドを答えてください。
必ず「起票」、「記録」、「終了」のいずれかを答えてください。
    `;

  try {
    const response = await openaiClient.createChatCompletion({
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: prompt }],
    });
    console.log(response.data.choices);
    return response.data.choices[0].message?.content;
  } catch (err) {
    console.error(err);
  }
}
