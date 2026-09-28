/* =========================================================================
   4. 迷路生成（反復版 recursive backtracker）
   ========================================================================= */
var GW = 31, GH = 31;      // 必ず奇数
var CELL = 4.2;            // 1マスのワールドサイズ
var WALL_H = 3.6;

// 病棟を3x3に区切った区画記号。壁のプレートに焼いて現在地の手がかりにする
var ZONE_LETTERS = ['A','B','C','D','E','F','G','H','J'];   // I は 1 と紛れるので飛ばす
/* 区画ごとの色調。
   9 区画がどれも同じ色なので、区画表示板を読むまで自分がどこにいるか
   分からなかった。壁も床も天井も結合ジオメトリで頂点色を持っているので、
   マスの区画で色を掛けるだけなら描画の回数は 1 回のまま増えない。

   派手に色を変えると別のゲームになるので、あくまで「別の翼に来た」と
   分かる程度に留める（明度 ±8%、色相は寒暖の振り分けだけ）。 */
var ZONE_TINT = [
  [1.00, 1.00, 1.00],   // 0 基準（旧病棟）
  [0.97, 1.00, 0.97],   // 1 手術区画：緑がかる
  [1.03, 0.99, 0.93],   // 2 事務区画：黄ばむ
  [0.94, 0.97, 1.03],   // 3 霊安室側：青く冷える
  [1.02, 1.01, 0.97],   // 4 中央ホール：少し暖かい
  [0.96, 0.99, 0.98],   // 5 隔離区画：色が抜ける
  [1.01, 0.97, 0.94],   // 6 給湯・配膳：赤茶
  [0.95, 1.00, 1.00],   // 7 検査区画：青緑
  [1.00, 0.96, 0.92]    // 8 焼却炉側：煤けて赤い
];
function zoneTint(cx: any, cy: any){ return ZONE_TINT[zoneOf(cx, cy)]; }

function zoneOf(cx: any, cy: any){
  var zx = clamp(Math.floor(cx * 3 / GW), 0, 2);
  var zy = clamp(Math.floor(cy * 3 / GH), 0, 2);
  return zy*3 + zx;
}

function idx(x: any,y: any){ return y*GW + x; }
function inBounds(x: any,y: any){ return x>=0 && y>=0 && x<GW && y<GH; }

function genMaze(loopChance: any){
  var g = new Uint8Array(GW*GH);
  g.fill(1);
  var stack = ([] as number[]);
  var sx = 1, sy = 1;
  g[idx(sx,sy)] = 0;
  stack.push(sx, sy);
  var dirs = [[2,0],[-2,0],[0,2],[0,-2]];

  while(stack.length){
    var cy = stack[stack.length-1], cx = stack[stack.length-2];
    // 未訪問の隣接候補
    var cand = [];
    for(var i=0;i<4;i++){
      var nx = cx+dirs[i][0], ny = cy+dirs[i][1];
      if(nx>0 && ny>0 && nx<GW-1 && ny<GH-1 && g[idx(nx,ny)] === 1) cand.push(i);
    }
    if(cand.length === 0){ stack.pop(); stack.pop(); continue; }
    var d = dirs[cand[(rnd()*cand.length)|0]];
    var wx = cx + d[0]/2, wy = cy + d[1]/2;
    var tx = cx + d[0],   ty = cy + d[1];
    g[idx(wx,wy)] = 0;
    g[idx(tx,ty)] = 0;
    stack.push(tx, ty);
  }
  // ループを開けて行き止まりを減らす（追跡が理不尽にならないように）
  for(var y=1;y<GH-1;y++) for(var x=1;x<GW-1;x++){
    if(g[idx(x,y)] !== 1) continue;
    var hOpen = g[idx(x-1,y)]===0 && g[idx(x+1,y)]===0 && g[idx(x,y-1)]===1 && g[idx(x,y+1)]===1;
    var vOpen = g[idx(x,y-1)]===0 && g[idx(x,y+1)]===0 && g[idx(x-1,y)]===1 && g[idx(x+1,y)]===1;
    if((hOpen||vOpen) && rnd() < loopChance) g[idx(x,y)] = 0;
  }
  return g;
}

// 通路だけだと全部同じ景色になるので、開けた部屋をいくつか掘る（＝目印になる）
function carveRooms(g: any, count: any){
  var rooms = [];
  for(var i=0; i<count*4 && rooms.length<count; i++){
    var rw = 3 + ((rnd()*2)|0)*2, rh = 3 + ((rnd()*2)|0)*2;
    var rx = 2 + ((rnd()*(GW-rw-3))|0), ry = 2 + ((rnd()*(GH-rh-3))|0);
    var clash = false;
    for(var j=0;j<rooms.length;j++){
      var r: any = rooms[j];
      if(rx < r.x+r.w+2 && rx+rw+2 > r.x && ry < r.y+r.h+2 && ry+rh+2 > r.y){ clash = true; break; }
    }
    if(clash) continue;
    if(rx <= 2 && ry <= 2) continue;                 // 左上の隅は通路のままにしておく
    for(var y=ry; y<ry+rh; y++) for(var x=rx; x<rx+rw; x++){
      if(x<1 || y<1 || x>GW-2 || y>GH-2) continue;
      g[idx(x,y)] = 0;
    }
    rooms.push({ x:rx, y:ry, w:rw, h:rh, cx:rx+(rw>>1), cy:ry+(rh>>1) });
  }
  return rooms;
}

// まっすぐな長い廊下。見通しがきくぶん、遠くの気配に気づける
function carveHalls(g: any, count: any){
  for(var i=0;i<count;i++){
    var horiz = rnd() < 0.5;
    var len = 8 + ((rnd()*9)|0);
    if(horiz){
      var hy = 1 + ((rnd()*(GH-2))|0);
      var hx = 1 + ((rnd()*Math.max(1, GW-len-2))|0);
      for(var a=0;a<len;a++){
        var cx = hx+a; if(cx < 1 || cx > GW-2) continue;
        g[idx(cx, hy)] = 0;
      }
    }else{
      var vx = 1 + ((rnd()*(GW-2))|0);
      var vy = 1 + ((rnd()*Math.max(1, GH-len-2))|0);
      for(var b2=0;b2<len;b2++){
        var cy = vy+b2; if(cy < 1 || cy > GH-2) continue;
        g[idx(vx, cy)] = 0;
      }
    }
  }
}

// 通路から突き出た行き止まりの窪み。隠れ場所や物置になる
function carveAlcoves(g: any, count: any){
  var D = [[1,0],[-1,0],[0,1],[0,-1]];
  var made = 0;
  for(var i=0;i<count*6 && made<count;i++){
    var x = 2 + ((rnd()*(GW-4))|0), y = 2 + ((rnd()*(GH-4))|0);
    if(g[idx(x,y)] !== 1) continue;
    var open = 0;
    for(var k=0;k<4;k++){
      var nx = x+D[k][0], ny = y+D[k][1];
      if(inBounds(nx,ny) && g[idx(nx,ny)] === 0) open++;
    }
    if(open !== 1) continue;      // 通路にひとつだけ面している壁を窪みにする
    g[idx(x,y)] = 0;
    made++;
  }
}

// 中央の大広間
function carveHall(g: any){
  var hw = 7, hh = 5;
  var x0 = ((GW - hw) >> 1), y0 = ((GH - hh) >> 1);
  for(var y=y0; y<y0+hh; y++) for(var x=x0; x<x0+hw; x++){
    if(x<1||y<1||x>GW-2||y>GH-2) continue;
    g[idx(x,y)] = 0;
  }
  return { x:x0, y:y0, w:hw, h:hh, cx:x0+(hw>>1), cy:y0+(hh>>1) };
}

// BFS 距離場（-1 = 到達不可）
function bfsField(g: any, sx: any, sy: any){
  var dist = new Int32Array(GW*GH); dist.fill(-1);
  var q = new Int32Array(GW*GH*2), head=0, tail=0;
  dist[idx(sx,sy)] = 0;
  q[tail++]=sx; q[tail++]=sy;
  var DX=[1,-1,0,0], DY=[0,0,1,-1];
  while(head<tail){
    var cx=q[head++], cy=q[head++];
    var dc = dist[idx(cx,cy)];
    for(var i=0;i<4;i++){
      var nx=cx+DX[i], ny=cy+DY[i];
      if(!inBounds(nx,ny)) continue;
      var k = idx(nx,ny);
      if(g[k]!==0 || dist[k]!==-1) continue;
      dist[k] = dc+1;
      q[tail++]=nx; q[tail++]=ny;
    }
  }
  return dist;
}

// 経路探索：start から goal への次の一歩を返す（goal 側から BFS）
function bfsNextStep(g: any, sx: any, sy: any, gx: any, gy: any){
  if(sx===gx && sy===gy) return null;
  var field = bfsField(g, gx, gy);
  var here = field[idx(sx,sy)];
  if(here < 0) return null;
  var DX=[1,-1,0,0], DY=[0,0,1,-1];
  for(var i=0;i<4;i++){
    var nx=sx+DX[i], ny=sy+DY[i];
    if(!inBounds(nx,ny)) continue;
    var v = field[idx(nx,ny)];
    if(v >= 0 && v === here-1) return {x:nx, y:ny};
  }
  return null;
}

function cellToWorld(cx: any, cy: any){
  return { x:(cx - (GW-1)/2)*CELL, z:(cy - (GH-1)/2)*CELL };
}
function worldToCell(x: any, z: any){
  return { x: Math.round(x/CELL + (GW-1)/2), y: Math.round(z/CELL + (GH-1)/2) };
}

// グリッド上の視線判定（DDA）
function hasLOS(g: any, x0: any, z0: any, x1: any, z1: any){
  var dx = x1-x0, dz = z1-z0;
  var dist = Math.sqrt(dx*dx+dz*dz);
  if(dist < 0.001) return true;
  var steps = Math.ceil(dist / (CELL*0.28));
  for(var i=1;i<steps;i++){
    var t = i/steps;
    var c = worldToCell(x0+dx*t, z0+dz*t);
    if(!inBounds(c.x,c.y) || g[idx(c.x,c.y)] !== 0) return false;
  }
  return true;
}

// 立っている人の目線を遮る什器の高さ。
// 机 0.80 / ベッド 0.81 / ドラム缶 1.05 は越しに見えるのが自然なので通し、
// ロッカー 2.05 だけを遮蔽物として扱う。
var SIGHT_H = 1.5;

// 什器による遮蔽（線分と円の最近接距離）。
// hasLOS は壁しか見ないので、背の高い什器はここで別に判定する。
function propBlocksSight(x0: any, z0: any, x1: any, z1: any){
  var props = world.props;
  if(!props || !props.length) return false;
  var dx = x1-x0, dz = z1-z0;
  var len2 = dx*dx + dz*dz;
  if(len2 < 1e-6) return false;
  for(var i=0;i<props.length;i++){
    var op = props[i];
    if(!(op.h > SIGHT_H)) continue;
    var t = ((op.x-x0)*dx + (op.z-z0)*dz) / len2;
    if(t < 0) t = 0; else if(t > 1) t = 1;
    var cx = x0 + dx*t - op.x, cz = z0 + dz*t - op.z;
    if(cx*cx + cz*cz < op.r*op.r) return true;
  }
  return false;
}

// 「見えるか」の判定。壁と背の高い什器の両方を見る。
// 音の減衰や聴覚距離には使わない（ロッカーは壁ではないので音は回り込む）
function hasSight(g: any, x0: any, z0: any, x1: any, z1: any){
  return hasLOS(g, x0, z0, x1, z1) && !propBlocksSight(x0, z0, x1, z1);
}

