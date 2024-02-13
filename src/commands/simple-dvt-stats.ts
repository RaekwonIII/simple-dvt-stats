import { Command } from "commander";
import figlet from "figlet";
import axios from "axios";

export const simpleDVT = new Command("simple-dvt");

simpleDVT
  .version("0.0.1", "-v, --vers", "output the current version")
  .action(async () => {
    console.info(figlet.textSync("Simple DVT Stats"));
    // spinnerInfo(`Obtaining Lido operators\n`);

    let clusters = [
      "35,44,118,129,151,192,195",
      "24,32,47,55,83,104,108",
      "76,101,114,127,145,188,208",
      "68,81,95,97,116,123,162",
      "43,104,139,178,182,203,209",
      "19,21,33,60,185,212,223",
      "42,59,103,125,183,184,189",
      "32,35,61,65,66,77,86",
      "140,157,172,175,193,202,214",
      "29,45,48,53,62,117,205",
      "32,85,97,121,199,219,237",
      "11,28,54,56,70,110,120",
      "19,22,25,82,119,156,226",
      "36,64,80,113,122,144,178",
      "16,27,86,90,200,204,214",
      "72,77,91,95,161,228,229",
      "11,37,68,131,134,137,141",
      "75,100,107,132,154,175,197",
      "112,129,130,143,163,183,191",
      "30,49,52,69,110,149,206",
      "54,101,140,177,194,200,212",
      "20,45,94,126,151,198,230",
      "21,30,67,84,98,196,218",
      "26,40,46,56,58,135,148",
      "93,109,167,173,217,220,222",
      "60,81,105,153,193,202,207",
      "26,41,79,111,156,159,174",
      "17,35,66,87,102,114,181",
      "92,98,106,136,173,213,227",
      "23,70,99,103,129,152,171",
      "11,41,69,179,190,208,217",
      "23,63,118,142,187,210,215",
    ];

    let simpleDVTValidators = [];

    for (let cluster of clusters) {
      let validators = await getClusterValidators(cluster);
      simpleDVTValidators.push(...validators);
    }

    // console.log(simpleDVTValidators?.length);
    // console.log(simpleDVTValidators);
    let validatorDataBatches: ValidatorData[] = [];
    for (let i = 1; i < simpleDVTValidators?.length / 200; i++) {
      console.log(`Requestind data for batch number ${i}`);
      let batchValidatorData = await getBatchValidatorData(
        simpleDVTValidators.slice((i - 1) * 200, i * 200)
      );
      if (batchValidatorData) validatorDataBatches.push(batchValidatorData);
    }
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
    console.log(`Total Validators uptime: ${uptime}`);
    console.log(`Total Validators Effectiveness: ${attesterEffectiveness}`);
    console.log(
      `Total Validators Proposal ratio: ${totalProposed / totalProposedDuties}`
    );
  });

async function getClusterValidators(cluster: string): Promise<string[]> {
  console.log(
    `Obtaining Lido operators\n${process.env.E2M_CLUSTER_API}${cluster}`
  );
  let response = await axios({
    method: "GET",
    url: `${process.env.E2M_CLUSTER_API}${cluster}`,
    headers: {
      "content-type": "application/json",
    },
  });

  // console.log(response)
  if (response.status !== 200) throw Error("Request did not return OK");
  // generate a map with {id: {operator info}}
  // console.log(response.data.Data);
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
  validators: string[]
): Promise<ValidatorData | undefined> {
  let validatorIndices = validators.join("&indices=");
  let url = `${process.env.RATED_API}${process.env.RATED_API_PARAMS}${validatorIndices}`;
  console.log(url);

  let response;
  try {
    response = await axios({
      method: "GET",
      url: url,
      headers: {
        "content-type": "application/json",
        "X-Rated-Network": "holesky",
        Authorization: `Bearer ${process.env.RATED_AUTH}`,
      },
    });

    if (response.status !== 200) throw Error("Request did not return OK");
    // generate a map with {id: {operator info}}
    let batchValidatorData = response.data.data[0];
    // console.log(batchValidatorData)
    return batchValidatorData;
  } catch (err) {
    // spinnerError();
    // stopSpinner();
    console.error("ERROR DURING AXIOS REQUEST");
    // console.error(err)
  }
}
