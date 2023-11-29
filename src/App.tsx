import { connect, disconnect, StarknetWindowObject } from "get-starknet";
import { useEffect, useState } from "react";
import Alert from "react-bootstrap/Alert";
import Table from "react-bootstrap/Table";
import Button from "react-bootstrap/Button";
import { parse } from "papaparse";
import { ethers } from "ethers";
import { Call, CallData, RpcProvider, uint256 } from "starknet";
import "./App.css";

//

const papaparseOptions = {
  header: true,
  dynamicTyping: false,
  skipEmptyLines: true,
  fileEncoding: "UTF-8",
};

interface ILine {
  To: string;
  ToAddress: string;
  Token: string;
  TokenAddress: string;
  Amount: string;
  status?: string;
  hash?: string;
}

function App() {
  const [lines, setLines] = useState<ILine[]>();
  const [status, setStatus] = useState<string>();
  const [error, setError] = useState<string>();
  const [wallet, setWallet] = useState<StarknetWindowObject>();
  const [provider, setProvider] = useState<RpcProvider>();

  wallet?.on("networkChanged", (accounts: string[]) => {
    console.log("networkChanged", accounts);
  });

  async function connectWallet() {
    const wallet = await connect({ include: ["argentX"] });
    if (!wallet) {
      return;
    }
    let nodeUrl = "";
    setWallet(wallet);
    if (wallet.chainId === "SN_MAIN") {
      nodeUrl = "https://starknet-mainnet.infura.io/v3/76fac2f9c85a49878a233e624acd14d5";
    } else if (wallet.chainId === "SN_GOERLI") {
      nodeUrl = "https://starknet-goerli.infura.io/v3/76fac2f9c85a49878a233e624acd14d5";
    }
    setProvider(new RpcProvider({ nodeUrl }));
  }

  useEffect(() => {
    if (!wallet) return;
    const handler = async (accounts: string[]) => {
      console.log("networkChanged", accounts);
      await connectWallet();
    };
    wallet.on("networkChanged", handler);
    return () => {
      wallet.off("networkChanged", handler);
    };
  }, [wallet]);

  const handleChangeFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { files } = e.target;
    if (!files?.length) {
      return;
    }

    let reader = new FileReader();
    reader.onload = () => {
      const csvData = parse<ILine>(reader.result as string, papaparseOptions);
      setLines(csvData?.data ?? []);
    };
    reader.readAsText(files[0], papaparseOptions.fileEncoding);
  };

  const handleSend = async (lines: ILine[]) => {
    setStatus(undefined);

    const promises = lines.map(async ({ ToAddress, Token, TokenAddress, Amount }) => {
      const { result } = await provider!.callContract({ contractAddress: TokenAddress, entrypoint: "decimals" });
      const [decimals] = result;
      console.log("decimals for ", Token, "->", decimals);
      const amount = ethers.utils.parseUnits(Amount, decimals).toString();
      return {
        contractAddress: TokenAddress,
        entrypoint: "transfer",
        calldata: CallData.compile([ToAddress, uint256.bnToUint256(amount)]),
      };
    });

    const calls: Call[] = await Promise.all(promises);

    console.log("handleSend", { lines, calls });
    // setLines((lines) => lines?.map((l, i) => (i === index ? { ...l, status: "Loading", hash: undefined } : l)));
    try {
      const { transaction_hash } = await wallet?.account.execute(calls);
      setStatus(`Transaction sent: ${transaction_hash}`);
      await wallet?.provider.waitForTransaction(transaction_hash);
      setStatus(`Confirmed: ${transaction_hash}`);
    } catch (e) {
      // setLines((lines) => lines?.map((l, i) => (i === index ? { ...l, status: "Error (see below)" } : l)));
      setError(`${e}`);
      throw e;
    }
  };

  if (!wallet) {
    return (
      <div className="App mt-3">
        <Button onClick={connectWallet}>Connect wallet</Button>
      </div>
    );
  }

  const address = wallet.account.address;
  return (
    <div className="App mt-3 px-3">
      <div className="fw-light">
        Connected {address!.slice(0, 6)}...{address!.slice(-4)} to {wallet.chainId}.{" "}
        <a
          href="/"
          onClick={async (e) => {
            e.preventDefault();
            await disconnect();
            setWallet(undefined);
          }}
        >
          Disconnect
        </a>
      </div>
      <div className="text-center mx-auto mt-3" style={{ maxWidth: 400 }}>
        <input className="form-control" id="formFileLg" type="file" placeholder="Foo" onChange={handleChangeFile} />
      </div>
      {lines && (
        <>
          <Table striped bordered hover size="sm" className="mt-3">
            <thead>
              <tr>
                <th>To</th>
                <th>ToAddress</th>
                <th>Token</th>
                <th>TokenAddress</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, index) => (
                <tr key={index}>
                  <td className="align-middle">{line.To}</td>
                  <td className="align-middle" style={{ fontSize: "0.8rem" }}>
                    {line.ToAddress}
                  </td>
                  <td className="align-middle">{line.Token}</td>
                  <td className="align-middle" style={{ fontSize: "0.8rem" }}>
                    {line.TokenAddress}
                  </td>
                  <td className="align-middle">{line.Amount}</td>
                </tr>
              ))}
            </tbody>
          </Table>
          <Button onClick={() => handleSend(lines)}>Send</Button>
          {status && <Alert variant="info">{status}</Alert>}
          {error && <Alert variant="danger">{error}</Alert>}
        </>
      )}
    </div>
  );
}

export default App;
