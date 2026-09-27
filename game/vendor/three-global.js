// three.js を window.THREE として出す。ゲーム本体は今も 1 つの関数スコープで
// THREE.* を直接書いているので、import に書き換えるまではこの形で渡す。
// 名前空間オブジェクトは凍っていて書き換えられない。r128 の THREE は
// ただのオブジェクトで、検証用のハーネスは THREE.WebGLRenderer を
// スタブに差し替えて動いているので、同じく書き換えられる写しを渡す。
import * as THREE from 'three';
window.THREE = Object.assign({}, THREE);
