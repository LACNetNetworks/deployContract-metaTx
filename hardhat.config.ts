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
    hardhat: {
      chainId: 31337,
      initialBaseFeePerGas: 0,
      mining: {
        auto: false,
        interval: 0,
      },
    },
    lnettest: {
      url: "https://testnet-writer-dev.l-net.io/",
   
      accounts: process.env.RELAYER_PK ? [process.env.RELAYER_PK] : [],
      chainId: 648540,
      gasPrice: 0,
      hubAddress: "0x4053cA6bcdEc6638d9Ad83a5c74d0246C7670ACd"
    },
    lnetmain: {
      //url: "https://mainnet-writer-dev.l-net.io/",
      url: "http://34.73.228.200:4545",

      accounts: process.env.RELAYER_PK ? [process.env.RELAYER_PK] : [],
      chainId: 648541,
      gasPrice: 0,
      hubAddress: "0x1B5c82C4093D2422699255f59f3B8A33c4a37773"
    },
  },
};

export default config;