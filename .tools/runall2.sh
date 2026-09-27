#!/bin/sh
# 1 プロセスで複数試行を回す版。仮想時計のリセットと botReset の作り直しで
# 1 本ずつ回した場合と結果が一致することを確認済み（8/8）。
F=$1; D=$2; S0=$3; N=$4; J=${5:-4}
i=0
while [ $i -lt $J ]; do
  SEEDS=""
  k=$i
  while [ $k -lt $N ]; do SEEDS="$SEEDS $((S0+k))"; k=$((k+J)); done
  WARD7_FILE=$F WARD7_FAST=1 node many.js $D $SEEDS &
  i=$((i+1))
done
wait
