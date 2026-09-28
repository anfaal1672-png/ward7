// 設計指示書 第 15.2 節（型付けへの一歩）。章ごとのファイルは同じ関数スコープを共有しているので、
// 組み立てた後のスクリプト（.check/ward7.js）に対して検める。
// 入れるのは「確実にバグ」の規則だけ。書き方の好みは入れない（既存の書き方を崩さない）。
import globals from 'globals';
export default [
  {
    files: ['.check/ward7.js'],
    languageOptions: {
      ecmaVersion: 2020, sourceType: 'script',
      globals: { ...globals.browser, THREE: 'readonly' }
    },
    rules: {
      'no-undef': 'error',            // 未定義の名前（ファイルを分けたので特に起きやすい）
      'no-dupe-keys': 'error', 'no-duplicate-case': 'error', 'no-dupe-else-if': 'error', 'no-dupe-args': 'error',
      'no-unreachable': 'error', 'valid-typeof': 'error', 'use-isnan': 'error', 'no-self-assign': 'error',
      'no-func-assign': 'error', 'no-obj-calls': 'error', 'no-unsafe-negation': 'error', 'getter-return': 'error',
      'no-const-assign': 'error', 'no-sparse-arrays': 'error', 'no-compare-neg-zero': 'error', 'no-cond-assign': ['error', 'except-parens']
    }
  }
];
