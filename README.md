<!-- @format -->

# 機能

Slack のスレッドの流れを解釈し、自動で issue を起票・記録・終了する SlackBOT です。
スレッド内で BOT にメンションすることにより以下の機能が利用できます。

## 自動起票

BOT に「起票して」など起票を促すメンションを行うことで起動します。
スレッドの会話の流れから行うべきタスクに関連する人物、行うべき作業、考慮すべき事項、現在の状況、期限、起票元の Slack のスレッドを判別できる範囲で解析し、その内容を Issue として自動起票します。
また、関連する人物をラベル付けします。

コマンド実行時にスレッド内ですでに起票している投稿が確認出来る場合は起票処理されません。

<img width="1049" alt="スクリーンショット 2023-04-18 18 59 57" src="https://user-images.githubusercontent.com/13215919/232743049-cfb79849-bd6d-4dae-9b9d-3ed86d72613e.png">

## 経過記録

BOT に「記録して」など記録を促すメンションを行うことで起動します。
スレッド内で起票しているログが確認できる場合、起票または経過記録以後に行われた会話から
現在の状況、追加された関係者、追加で行うべき作業、考慮すべき事項についてを判別できる範囲で解析し、Issue にコメントします。
<img width="1040" alt="スクリーンショット 2023-04-18 19 00 48" src="https://user-images.githubusercontent.com/13215919/232743274-5a0d9b62-a7b3-4f69-846e-09ae51f43301.png">

## 終了

BOT に「終了した」など終了をしたことを伝えるメンションを行うことで起動します。
スレッド内で課題に対するやり取りから、終了に至った経緯を判断し Issue へコメントを行ってクローズします。

<img width="1045" alt="スクリーンショット 2023-04-18 19 04 15" src="https://user-images.githubusercontent.com/13215919/232744320-66786b50-dcb9-4e1b-a4aa-7bd06ee63bd4.png">


## まとめ

すでに会話が終了してている過去のスレッド向けの機能です。やり取りをタスクとしてログ化することを目的としています。
BOT に「まとめて」などまとめを示唆するメンションを行うことで起動します。
スレッド内で起票されたログがない場合、そのスレッド内の会話からタスクに関連する人物、行われた作業、現在の状況、特記事項を判別できる範囲で解析し、その内容を Issue として起票して同時にクローズします。
もしスレッド内で起票されたログがある場合、経過記録と同じ挙動となり記録コメントが Issue に投稿されます。

<img width="1584" alt="スクリーンショット 2023-04-18 18 36 04" src="https://user-images.githubusercontent.com/13215919/232744429-33522333-b51e-41b3-bcab-dd01fa267e8d.png">



# チャンネルごとに任意のリポジトリに issue 投稿先を指定したい場合

チャンネルのトピック内の文章に `[repository:owner/repo]` の文字列が含まれるようにしてください。
（例: [repository:maiko-ando/AITaskManager] )

# 動作に必要なリソース

- Slack アカウント
- OpenAI API キー（GPT-4 利用前提）
- Lambda または Node が動作するサーバ

# 動作設定方法

## 関数が実行できるエンドポイントを用意

このパッケージの内容は Lambda 用の関数として作成していますが、Node が動作する任意の環境に設置してください。

## SlackBOT の作成

BOT 用エンドポイント

1. https://api.slack.com/apps にアクセス
1. Create New App をクリックし、新しいアプリを作成
1. アプリの管理画面を開き、左メニューの App Home から App Display Name を設定する（重要）
1. Event Subscriptions を有効にし、Subscribe to bot events で `app_mention` を追加する
1. Event Subscriptions の RequestURL の verify を行い有効化する
1. OAuth & Permissions から BOT に必要な権限を設定する
1. 任意のワークスペースにインストールする

### BOT に必要な権限

- app_mentions:read
- channels:history
- channels:read
- chat:write
- groups:history
- groups:read
- im:history
- im:read
- mpim:history
- mpim:read
- users:read
