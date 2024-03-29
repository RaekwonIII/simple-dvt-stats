import { Command } from "commander";
import figlet from "figlet";
import axios from "axios";
import { config } from "../config";
import axiosRateLimit from "axios-rate-limit";

export const simpleDVT = new Command("simple-dvt");

simpleDVT
  .version("0.0.1", "-v, --vers", "output the current version")
  .action(async () => {
    console.info(figlet.textSync("Simple DVT Stats"));
    // spinnerInfo(`Obtaining Lido operators\n`);

    let simpleDVTValidators: string[] = [];
    if (config.simpleDVTValidators) {
      // This is hardcoded to avoid spamming the e2m API
      simpleDVTValidators = config.simpleDVTValidators;
    } else {
      console.warn("Missing config, need to fetch cluster validators from e2m");
      for (let cluster in config.clusters) {
        let clusterValidators = await getClusterValidators(cluster);
        simpleDVTValidators.push(...clusterValidators);
      }
    }
    
    let validatorDataBatches: ValidatorData[] = await getBatchValidatorData(simpleDVTValidators);

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

    console.log(`Validators uptime: ${uptime}`);
    console.log(`Validators Effectiveness: ${attesterEffectiveness}`);
    console.log(`Total proposals: ${totalProposed}/${totalProposedDuties}`);
    console.log(
      `Validators Proposal ratio: ${totalProposed / totalProposedDuties}`
    );
  });

async function getClusterValidators(cluster: string): Promise<string[]> {
  console.log(
    `Obtaining Lido operators\n${process.env.E2M_CLUSTER_API}${cluster}`
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
  for (let i = 1; i <= simpleDVTValidators?.length / 200; i++) {
    console.log(`Requestind data for batch number ${i}`);
    let validators = simpleDVTValidators.slice((i - 1) * 200, i * 200);

    let validatorIndices = validators.join("&indices=");
    let url = `${process.env.RATED_API}${process.env.RATED_API_PARAMS}${validatorIndices}`;
    try {
      let response = await http.get(url, { headers: {
        "content-type": "application/json",
        "X-Rated-Network": "holesky",
        Authorization: `Bearer ${process.env.RATED_AUTH}`,
      }})

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
