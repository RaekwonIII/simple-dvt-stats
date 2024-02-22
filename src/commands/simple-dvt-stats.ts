import { Command } from "commander";
import figlet from "figlet";
import axios from "axios";
import { config } from "../config";
import axiosRateLimit from "axios-rate-limit";
import { writeFile } from "node:fs";

export const simpleDVT = new Command("simple-dvt");

type ValidatorData = {
  uptime: number;
  attesterEffectiveness: number;
  proposedCount: number;
  proposerDutiesCount: number;
  proposerEffectiveness: number;
};
var date = new Date();
var month = date.getMonth() + 1; // "+ 1" becouse the 1st month is 0
var day = date.getDate();
var hours = date.getHours();
var minutes = date.getMinutes();
var seconds = date.getSeconds();

const filename = `${__dirname}/../../validator-data-${date.getFullYear()}-${
  (month < 10 ? "0" : "") + month
}-${(day < 10 ? "0" : "") + day}T${(hours < 10 ? "0" : "") + hours}:${
  (minutes < 10 ? "0" : "") + minutes
}:${(seconds < 10 ? "0" : "") + seconds}Z.csv`;

writeFile(
  filename,
  `${["Cluster", "Uptime", "Effectiveness", "Proposals", "Proposal Ratio"].join(
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

simpleDVT
  .version("0.0.1", "-v, --vers", "output the current version")
  .argument("[cluster]", "the name of the cluster for which to fetch stats")
  .action(async (cluster) => {
    console.info(figlet.textSync("Simple DVT Stats"));

    if (!cluster) cluster = "all";
    let simpleDVTValidatorsDict: { [clusterName: string]: string[] } = {};
    // data for ALL clusters was requested
    if (cluster == "all" && config.simpleDVTValidators) {
      console.log(`Getting validator stats for ${cluster} clusters`);
      for (let [clusterName, operators] of Object.entries(config.clusterDict)) {
        let clusterValidators = await getClusterValidators(operators);
        simpleDVTValidatorsDict[
          clusterName as keyof typeof simpleDVTValidatorsDict
        ] = clusterValidators;

        if (
          simpleDVTValidatorsDict[
            clusterName as keyof typeof simpleDVTValidatorsDict
          ].length == 0
        ) {
          console.error(
            "Missing config, need to fetch cluster validators from e2m"
          );
        }
      }
    } else {
      // data for a SINGLE cluster was requested
      console.debug(`Provided ${cluster} as cluster shorthand`);
      let clusterNames = Object.keys(config.clusterDict);
      let clusterNameMatch = clusterNames.filter((el) =>
        el.toLocaleLowerCase().includes(cluster)
      )[0];

      console.debug(
        `Found ${clusterNameMatch}. Getting validator stats that cluster`
      );

      let clusterValidators = await getClusterValidators(
        config.clusterDict[clusterNameMatch as keyof typeof config.clusterDict]
      );
      simpleDVTValidatorsDict[
        clusterNameMatch as keyof typeof simpleDVTValidatorsDict
      ] = clusterValidators;

      if (Object.keys(simpleDVTValidatorsDict).length == 0) {
        console.error(
          "Missing config, need to fetch cluster validators from e2m"
        );
      }

      console.debug(
        `Found ${
          Object.keys(simpleDVTValidatorsDict).length == 0
        } validators belonging to ${clusterNameMatch}`
      );
    }

    let validatorDataByCluster = await getValidatorDataByCluster(
      simpleDVTValidatorsDict
    );

    Object.entries(validatorDataByCluster).map(
      ([clusterName, validatorData]) => {
        writeFile(
          filename,
          `${[
            clusterName,
            `${validatorData.uptime * 100}`,
            `${validatorData.attesterEffectiveness}`,
            `${validatorData.proposedCount}/${validatorData.proposerDutiesCount}`,
            `${
              (100 * validatorData.proposedCount) /
              validatorData.proposerDutiesCount
            }`,
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

    const validatorDataArray = Object.values(validatorDataByCluster);
    let initialValue: ValidatorData = {
      uptime: 0,
      attesterEffectiveness: 0,
      proposedCount: 0,
      proposerDutiesCount: 0,
      proposerEffectiveness: 0,
    };
    let totalSimpleDVTValidatorData = validatorDataArray.reduce(
      (accumulator: ValidatorData, currentValue: ValidatorData) => {
        accumulator.uptime += currentValue.uptime / validatorDataArray.length;
        accumulator.attesterEffectiveness +=
          currentValue.attesterEffectiveness / validatorDataArray.length;
        accumulator.proposedCount += currentValue.proposedCount;
        accumulator.proposerDutiesCount += currentValue.proposerDutiesCount;
        return accumulator;
      },
      initialValue
    );
    console.log(`Uptime: ${totalSimpleDVTValidatorData.uptime * 100} %`);
    console.log(
      `Effectiveness: ${totalSimpleDVTValidatorData.attesterEffectiveness} %`
    );
    console.log(
      `Total proposals: ${totalSimpleDVTValidatorData.proposedCount}/${totalSimpleDVTValidatorData.proposerDutiesCount}`
    );
    console.log(
      `Proposal ratio: ${
        (100 * totalSimpleDVTValidatorData.proposedCount) /
        totalSimpleDVTValidatorData.proposerDutiesCount
      } %`
    );
  });

async function getClusterValidators(cluster: string): Promise<string[]> {
  // console.debug(
  //   `Obtaining validators for cluster ${cluster}\n${process.env.E2M_CLUSTER_API}${cluster}`
  // );
  axios.create();
  let response = await axios({
    method: "GET",
    url: `${process.env.E2M_CLUSTER_API}${cluster}`,
    headers: {
      "content-type": "application/json",
    },
  });

  if (response.status !== 200) throw Error("Request did not return OK");
  let validators = Object.keys(response.data.Data);
  return validators;
}

async function getValidatorDataByCluster(simpleDVTValidatorsDict: {
  [clusterName: string]: string[];
}): Promise<{ [clusterName: string]: ValidatorData }> {
  const http = axiosRateLimit(axios.create(), { maxRPS: 1 });
  let validatorDataBatches: { [clusterName: string]: ValidatorData } = {};

  for (let [clusterName, simpleDVTValidators] of Object.entries(
    simpleDVTValidatorsDict
  )) {
    // console.log(
    //   `Requesting validator data for ${clusterName} cluster`
    // );

    let validatorIndices = simpleDVTValidators.join("&indices=");
    let url = `${process.env.RATED_API}${process.env.RATED_API_PARAMS}${validatorIndices}`;
    try {
      let response = await http.get(url, {
        headers: {
          "content-type": "application/json",
          "X-Rated-Network": "holesky",
          Authorization: `Bearer ${process.env.RATED_AUTH}`,
        },
      });

      if (response.status !== 200) throw Error("Request did not return OK");
      let clusterValidatorData = response.data.data[0];
      if (clusterValidatorData) {
        validatorDataBatches[clusterName] = clusterValidatorData;
        console.log(`Validator data for ${clusterName} cluster`);
        console.log(`Uptime: ${clusterValidatorData.uptime * 100} %`);
        console.log(
          `Effectiveness: ${clusterValidatorData.attesterEffectiveness} %`
        );
        console.log(
          `Total proposals: ${clusterValidatorData.proposedCount}/${clusterValidatorData.proposerDutiesCount}`
        );
        console.log(
          `Proposal ratio: ${
            (100 * clusterValidatorData.proposedCount) /
            clusterValidatorData.proposerDutiesCount
          } %`
        );
      }
    } catch (err) {
      // spinnerError();
      // stopSpinner();
      console.error("ERROR DURING AXIOS REQUEST");
    }
  }

  return validatorDataBatches;
}
