# 家計簿マネージャ

三井住友銀行(SMBC)と三井住友カード(VPass)のCSV明細から、月次家計簿のExcel(.xlsx)を作るブラウザ完結アプリ。**サーバ送信なし**で動作するため、明細データは端末の外に出ません。

## 主な機能

- **CSV取り込み**: SMBC銀行CSV / VPass CSV を D&D で投入。Shift_JIS / UTF-8 自動判別。
- **自動分類**: ルールベース(JSON編集可)で食費・交通費・光熱費・収入などに分類。
- **重複除外**: 銀行明細のVPass引落をカード明細と突合し、二重計上を自動マッチ・手動補正。
- **Excel出力**: 月次サマリ／銀行明細／カード明細／カテゴリ別集計の4シート構成。
- **推移グラフ**: 月次の収支・カテゴリ別積み上げ・主要カテゴリ折れ線。
- **履歴 (任意)**: 集計結果のみ `localStorage` に保存可能。生明細は保存しない。
- **完全クライアントサイド**: `connect-src 'self'` の CSP で外部送信ゼロ。

## 使い方

1. SMBCダイレクトの「Web通帳」と VPass の「明細CSVダウンロード」から、それぞれの月のCSVを保存。
2. このアプリを開き、CSVをドロップ → 「集計する」。
3. カード引落の重複を確認（自動マッチが既定で除外、必要に応じて手動補正）。
4. 「Excel(.xlsx) をダウンロード」。
5. 必要なら「履歴に保存」して翌月以降の推移グラフに反映。

## 開発

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # vitest (33 tests)
npm run build    # 静的成果物 -> dist/
npm run preview  # 本番ビルドの動作確認
```

## デプロイ (GitHub Pages)

`main` ブランチへの push で `.github/workflows/deploy.yml` が動き、`dist/` を Pages に配信します。リポジトリの Settings → Pages → Source を **GitHub Actions** に設定してください。

## ファイル構成

```
src/
  main.js                  エントリ。UIと処理パイプラインの結線
  parser/
    decode.js              Shift_JIS/UTF-8 自動判別
    detect.js              SMBC / VPass フォーマット判定
    smbc.js                SMBC CSV パーサ
    vpass.js               VPass CSV パーサ
  core/
    normalize.js           NFKC・金額・日付の正規化
    categorize.js          ルールベースのカテゴリ分類
    dedupe.js              VPass引落の重複検出と突合
    aggregate.js           月次・カテゴリ別の集計
  output/
    excel.js               ExcelJSによる4シートxlsx生成
  storage/
    history.js             集計済み数値のlocalStorage履歴
  ui/
    charts-view.js         Chart.jsの3グラフ
  rules.default.json       デフォルトのカテゴリルール (約25件)
  styles.css

tests/                     Vitest (パーサ/分類/重複除外/集計/Excelの単体テスト)
```

## カテゴリルールのカスタマイズ

`src/rules.default.json` と同じスキーマの JSON を「設定 → カテゴリルールを差し替える」で読み込めます。

```json
{
  "version": 1,
  "default": "未分類",
  "rules": [
    { "match": { "field": "description", "type": "regex", "value": "(ローソン|セブン-?イレブン)" }, "category": "食費", "subcategory": "コンビニ" },
    { "match": { "field": "description", "type": "contains", "value": "東京電力" }, "category": "光熱費" },
    { "match": { "field": "description", "type": "regex", "value": "VPASS|三井住友カード" }, "category": "カード引落", "priority": 100 }
  ]
}
```

- `field`: `description` / `amount` / `memo`
- `type`: `contains` / `equals` / `regex` / `gte` / `lte`
- `priority`: 高い順に評価（デフォルト 0）

## セキュリティ

- 全ライブラリをローカルバンドル。CDNは利用しません。
- `index.html` に CSP メタタグを設定し外部fetchを禁止。
- 履歴は集計済みの数値のみ保存（生明細は保存しません）。
- ブラウザのDevTools Networkタブで「外部通信ゼロ」を目視確認できます。

## ライセンス

MIT
