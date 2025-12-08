import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "dotenv/config";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      viaIR: true,
      metadata: { bytecodeHash: "none" },
    },
  },
  networks: {
    lnettest: {
      url: "http://35.185.112.219:4545",
      accounts: process.env.RELAYER_PK ? [process.env.RELAYER_PK] : [],
      chainId: 648540,
      gasPrice: 0,
      hubAddress: "0x9a49A9e7b5b07CDd6218624687D3C9FD30e853Bd"
    },
    lnetmain: {
      url: "http://34.73.228.200:4545",
      accounts: process.env.RELAYER_PK ? [process.env.RELAYER_PK] : [],
      chainId: 648541,
      gasPrice: 0,
      hubAddress: "0x1B5c82C4093D2422699255f59f3B8A33c4a37773"
    },
  },
};

export default config;