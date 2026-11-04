export {threeDaySpec} from '../../server/simulator/example.mjs';

// Independent constants transcribed from design R1, not computed by the simulator.
export const EXPECTED=[
  {raw:130,rawQualified:90,rawPending:40,rawFree:70,received:40,unreceived:20,consumed:30,rawScrap:0,fg:28,fgQualified:0,fgPending:28,output:28,processScrap:2,shipped:0,signed:0,delivery:0,demandRemaining:20,wip:0,remainingMinutes:0},
  {raw:80,rawQualified:80,rawPending:0,rawFree:60,received:40,unreceived:20,consumed:80,rawScrap:0,fg:8,fgQualified:8,fgPending:0,output:28,processScrap:2,shipped:20,signed:0,delivery:20,demandRemaining:10,wip:50,remainingMinutes:40},
  {raw:90,rawQualified:90,rawPending:0,rawFree:70,received:60,unreceived:0,consumed:80,rawScrap:10,fg:46,fgQualified:46,fgPending:0,output:76,processScrap:4,shipped:30,signed:20,delivery:10,demandRemaining:0,wip:0,remainingMinutes:0},
];
