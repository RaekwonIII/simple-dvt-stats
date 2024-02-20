import { Command } from "commander";
import figlet from "figlet";
import axios from "axios";
import { config } from "../config";
import axiosRateLimit from "axios-rate-limit";
import { ObjectType } from "typescript";

const readline = require("readline");

export const simpleDVT = new Command("simple-dvt");

simpleDVT
  .version("0.0.1", "-v, --vers", "output the current version")
  .argument("[cluster]", "the name of the cluster for which to fetch stats")
  .action(async (cluster) => {
    console.info(figlet.textSync("Simple DVT Stats"));

    let simpleDVTValidators: string[] = [];
    // data for ALL clusters was requested
    if ((!cluster || cluster == "all") && config.simpleDVTValidators) {
      console.log(`Getting validator stats for ${cluster} clusters`);
      // List in config to avoid spamming the e2m API
      simpleDVTValidators.push(...config.simpleDVTValidators);
      if (simpleDVTValidators.length == 0) {
        console.warn(
          "Missing config, need to fetch cluster validators from e2m"
        );
        for (let cluster in config.clusters) {
          let clusterValidators = await getClusterValidators(cluster);
          simpleDVTValidators.push(...clusterValidators);
        }
      }
    } else { // data for a SINGLE cluster was requested
      console.log(`Provided ${cluster} as cluster shorthand`);
      let clusterNames = Object.keys(config.clusterDict);
      let clusterNameMatch = clusterNames.filter((el) =>
        el.toLocaleLowerCase().includes(cluster)
      )[0];

      console.log(
        `Found ${clusterNameMatch}. Getting validator stats that cluster`
      );

      let clusterValidators = await getClusterValidators(
        config.clusterDict[clusterNameMatch as keyof typeof config.clusterDict]
      );
      simpleDVTValidators.push(...clusterValidators);

      if (simpleDVTValidators.length == 0) {
        console.error(
          "Missing config, need to fetch cluster validators from e2m"
        );
      }

      console.log(
        `Found ${simpleDVTValidators.length} validators belonging to ${clusterNameMatch}`
      );
    }

    let validatorDataBatches: ValidatorData[] = await getBatchValidatorData(
      simpleDVTValidators
    );

    let uptime = 0;
    let attesterEffectiveness = 0;
    let totalProposed = 0;
    let totalProposedDuties = 0;
    for (let batch of validatorDataBatches) {
      uptime += batch.uptime / validatorDataBatches.length;
      attesterEffectiveness +=
        batch.attesterEffectiveness / validatorDataBatches.length;
      totalProposed += batch.proposedCount;
      totalProposedDuties += batch.proposerDutiesCount;
    }

    console.log(`Uptime: ${uptime * 100} %`);
    console.log(`Effectiveness: ${attesterEffectiveness} %`);
    console.log(`Total proposals: ${totalProposed}/${totalProposedDuties}`);
    console.log(
      `Proposal ratio: ${100* totalProposed / totalProposedDuties} %`
    );
  });

async function getClusterValidators(cluster: string): Promise<string[]> {
  console.log(
    `Obtaining validators for cluster ${cluster}\n${process.env.E2M_CLUSTER_API}${cluster}`
  );
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

type ValidatorData = {
  uptime: number;
  attesterEffectiveness: number;
  proposedCount: number;
  proposerDutiesCount: number;
  proposerEffectiveness: number;
};

async function getBatchValidatorData(
  simpleDVTValidators: string[]
): Promise<ValidatorData[]> {
  const http = axiosRateLimit(axios.create(), { maxRPS: 2 });
  let validatorDataBatches: ValidatorData[] = [];
  for (let i = 0; i < simpleDVTValidators?.length / 200; i++) {
    console.log(`Requestind data for batch number ${i + 1}`);
    let validators = simpleDVTValidators.slice(i * 200, (i + 1) * 200);

    let validatorIndices = validators.join("&indices=");
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
      let batchValidatorData = response.data.data[0];
      if (batchValidatorData) validatorDataBatches.push(batchValidatorData);
      // console.log(batchValidatorData)
    } catch (err) {
      // spinnerError();
      // stopSpinner();
      console.error("ERROR DURING AXIOS REQUEST");
    }
  }
  return validatorDataBatches;
}
