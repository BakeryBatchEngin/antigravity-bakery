import os

with open("AGENTS.md", "r", encoding="utf-8") as f:
    c = f.read()

new_rule = """
## 2. コマンド実行に関する権限（AIの自律実行）
開発スピードを向上させるため、以下のコマンドについてはAIが承認を待たずに自律的に実行してよいものとする。
- ファイルの検索や読み込み
- コードの書き換え・修正（Pythonスクリプト等によるローカルファイルの編集）
- ローカル環境でのコンパイルチェックやテスト

ただし、以下の**重要・破壊的な操作**については、必ず事前にユーザーの承認を得ること。
- 本番環境へのデプロイ（`git push` 等）
- データベースの削除、初期化、スキーマ変更などの破壊的な操作
- 新しいパッケージのインストール（`npm install` 等）
"""

c = c + "\n" + new_rule

with open("AGENTS.md", "w", encoding="utf-8") as f:
    f.write(c)
print("Updated AGENTS.md")
