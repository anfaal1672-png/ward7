// 組み立てたスクリプト（.check/ward7.js）を型で検めるための外側の宣言（設計指示書 第 15.2 節 手順 2）。
// いまは any から始める。three はページの <script> で読む一枚物（window.THREE）
declare const THREE: any;
interface Window { [k: string]: any; }
interface Navigator { [k: string]: any; }
