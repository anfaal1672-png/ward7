#!/bin/sh
F=$1; D=$2; S0=$3; N=$4; J=${5:-4}
i=0
while [ $i -lt $N ]; do
  j=0
  while [ $j -lt $J ] && [ $i -lt $N ]; do
    WARD7_FILE=$F node one.js $D $((S0+i)) &
    i=$((i+1)); j=$((j+1))
  done
  wait
done
