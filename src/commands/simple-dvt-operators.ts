import { Command } from "commander";
import figlet from "figlet";
import axios from "axios";
import { config } from "../config";
import axiosRateLimit from "axios-rate-limit";
import { writeFile } from "node:fs";

export const operatorData = new Command("operator-data");

var date = new Date();
var month = date.getMonth() + 1; // "+ 1" becouse the 1st month is 0
var day = date.getDate();
var hours = date.getHours();
var minutes = date.getMinutes();
var seconds = date.getSeconds();

const filename = `${__dirname}/../../operator-data-${date.getFullYear()}-${
  (month < 10 ? "0" : "") + month
}-${(day < 10 ? "0" : "") + day}T${(hours < 10 ? "0" : "") + hours}:${
  (minutes < 10 ? "0" : "") + minutes
}:${(seconds < 10 ? "0" : "") + seconds}Z.csv`;

type OperatorData = {
  operatorId: number;
  clusterName: string;
  performance: number;
};

operatorData
  .version("0.0.1", "-v, --vers", "output the current version")
  .action(async (cluster) => {
    console.info(figlet.textSync("Simple DVT Stats"));

    writeFile(
      filename,
      `${["OperatorId", "Cluster", "30d Performance"].join(
        ","
      )}\n`,
      { flag: "a+" },
      (err) => {
        if (err) {
          console.error(err);
        } else {
          console.log("Initialized CSV file with columns");
        }
      }
    );

    let simpleDVTOperatorData: OperatorData[] = [];
    // data for ALL clusters was requested
    console.log(`Getting validator stats for all clusters`);
    for (let [clusterName, operators] of Object.entries(config.clusterDict)) {
      let owner = config.clusterOwnersDict[clusterName as keyof typeof config.clusterOwnersDict];

      let clusterOperatorData = await getClusterOperatorData(owner, clusterName, operators);
      simpleDVTOperatorData.push(...clusterOperatorData)
    }

    simpleDVTOperatorData.map(
      (operator) => {
        writeFile(
          filename,
          `${[
            `${operator.operatorId}`,
            operator.clusterName,
            `${operator.performance}`,
          ].join(",")}\n`,
          { flag: "a+" },
          (err) => {
            if (err) {
              console.error(err);
            } else {
              // console.log("Initialized CSV file with columns")
            }
          }
        );
      }
    );
  });

async function getClusterOperatorData(owner:string, clusterName:string, operators:string): Promise<OperatorData[]> {

  axios.create();
  let response = await axios({
    method: "GET",
    url: `${process.env.SSV_API}/clusters/owner/${owner}/operators/${operators}?operatorDetails=true`,
    headers: {
      "content-type": "application/json",
    },
  });

  if (response.status !== 200) throw Error("Request did not return OK");
  let operatorsData = response.data.cluster.operators.map((operator: { id: any; fee: string; performance: { [x: string]: any; }; }) => {
    if (operator.fee != "0") console.log(`Operator ${operator.id} in cluster ${clusterName} has a ${operator.fee} fee, instead of 0`)
    
    console.log(`Operator ${operator.id} in cluster ${clusterName} has ${operator.performance["30d"]} performance over 30 days`)
    return {
      operatorId: operator.id,
      clusterName: clusterName,
      performance: operator.performance["30d"]
    }
  });
  return operatorsData;
}
