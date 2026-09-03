// 起動直後の状態を指紋化する。1本目として走らせた場合と、
// 2本目として走らせた場合で違うものが「持ち越されている状態」。
const H=require('./harness.js'); const A=H.window.__WARD7;
const args=process.argv.slice(2).map(Number);
function run(sd, full){
  A.toTitle(); A.skipUI(true); A.seed(sd); A.botOn(true); A.settings.diff=0; A.start(); H.pump(2);
  if(full){ let f=0; while(A.state()===2 && f<800*60){ H.pump(30); f+=30; } return; }
  const p=A.player, h=A.hunter, w=A.world, b=A.bot;
  let gs=0; for(let i=0;i<w.grid.length;i++) gs=(gs*31+w.grid[i])|0;
  const o={grid:gs, px:+p.x.toFixed(4), pz:+p.z.toFixed(4), yaw:+p.yaw.toFixed(4),
    hx:+h.x.toFixed(4), hz:+h.z.toFixed(4), props:w.props.length,
    recs:w.records.length, bats:w.batteries.length, hides:(w.hides||[]).length,
    time:+p.time.toFixed(3), bat:+p.battery.toFixed(3), stam:+p.stamina.toFixed(3),
    san:+p.sanity.toFixed(3), hp:p.hp, seen:b.seen.length, fleeT:+b.fleeT.toFixed(3),
    hideT:+b.hideT.toFixed(3), useCd:+b.useCd.toFixed(3), quietT:+b.quietT.toFixed(3),
    glanceT:+b.glanceT.toFixed(3), earVol:+b.ear.vol.toFixed(5), hposFresh:+b.hposFresh.toFixed(3),
    trail:b.trail.length, danger:(function(){let s=0;for(let i=0;i<b.danger.length;i++)s+=b.danger[i];return s;})(),
    known:(function(){let s=0;for(let i=0;i<b.known.length;i++)s+=b.known[i];return s;})(),
    pen:(function(){let s=0;for(let i=0;i<b.penalty.length;i++)s+=b.penalty[i];return s;})(),
    hmem:+h.memT.toFixed(3), hmode:h.mode, hglitch:+h.glitchT.toFixed(3), heye:+h.eyeT.toFixed(3),
    hgrace:+h.spawnGrace.toFixed(3), hstep:+h.stepAcc.toFixed(4),
    vx:+p.vx.toFixed(5), vz:+p.vz.toFixed(5), vyaw:+p.viewYaw.toFixed(5),
    lookX:+A.input.lookX.toFixed(5), lookY:+A.input.lookY.toFixed(5),
    fwd:+A.input.fwd.toFixed(4), side:+A.input.side.toFixed(4),
    keys:Object.keys(A.input.keys).filter(k=>A.input.keys[k]).join(','),
    use:!!A.input.use, bob:+p.bob.toFixed(5), step:+p.stepAcc.toFixed(5),
    shake:+p.shake.toFixed(5), pitch:+p.pitch.toFixed(5)};
  console.log(JSON.stringify(o));
}
if(args.length>1) run(args[0], true);
run(args[args.length-1], false);
