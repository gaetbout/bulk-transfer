import { useState } from "react";
import Alert from "react-bootstrap/Alert";
import Table from "react-bootstrap/Table";
import Button from "react-bootstrap/Button";
import { useAccount, useConnect, useDisconnect, useNetwork, useProvider } from "wagmi";
import { prepareSendTransaction, sendTransaction } from "@wagmi/core";
import { InjectedConnector } from "wagmi/connectors/injected";
import { parse } from "papaparse";
import { ethers } from "ethers";
import "./App.css";

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

const erc20Abi = new ethers.utils.Interface([
  "function decimals() view returns (uint256)",
  "function transfer(address _to, uint256 _value)",
]);

function App() {
  const [lines, setLines] = useState<ILine[]>();
  const [error, setError] = useState<string>();

  const { address, isConnected } = useAccount();
  const { connect } = useConnect({ connector: new InjectedConnector() });
  const { disconnect } = useDisconnect();
  const { chain } = useNetwork();
  const provider = useProvider();

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

  const handleSend = async (line: ILine) => {
    const index = lines?.findIndex((l) => l === line);
    // const line = lines?.[sendIndex];
    console.log("handleSend", line);
    setLines((lines) => lines?.map((l, i) => (i === index ? { ...l, status: "Loading", hash: undefined } : l)));
    try {
      let request;
      if (line.Token === "ETH") {
        request = { to: line.ToAddress, value: ethers.utils.parseEther(line.Amount) };
      } else {
        const erc20 = new ethers.Contract(line.TokenAddress, erc20Abi, provider);
        const decimals = await erc20.decimals();
        console.log("decimals", decimals);
        const amount = ethers.utils.parseUnits(line.Amount, decimals);
        const data = erc20Abi.encodeFunctionData("transfer", [line.ToAddress, amount]);
        request = { to: line.TokenAddress, data };
      }
      const config = await prepareSendTransaction({ request });
      const { hash, wait } = await sendTransaction(config);
      setLines((lines) => lines?.map((l, i) => (i === index ? { ...l, status: "Pending", hash } : l)));
      console.log("hash", hash);
      const receipt = await wait();
      setLines((lines) => lines?.map((l, i) => (i === index ? { ...l, status: "Done" } : l)));
      console.log("receipt", receipt);
    } catch (e) {
      setLines((lines) => lines?.map((l, i) => (i === index ? { ...l, status: "Error (see below)" } : l)));
      setError(`${e}`);
      throw e;
    }
  };

  const hashLink = (hash: string | undefined) => {
    if (!hash) return "";
    const subdomain = chain?.name === "Goerli" ? "goerli." : "";
    const href = `https://${subdomain}etherscan.io/tx/${hash}`;
    return (
      <a href={href} target="_blank" rel="noreferrer">
        {hash.slice(0, 2)}...{hash.slice(-4)}
      </a>
    );
  };

  if (!isConnected) {
    return (
      <div className="App mt-3">
        <Button onClick={() => connect()}>Connect wallet</Button>
      </div>
    );
  }

  return (
    <div className="App mt-3 px-3">
      <div className="fw-light">
        Connected {address!.slice(0, 6)}...{address!.slice(-4)} to {chain?.name}.{" "}
        <a
          href="/"
          onClick={(e) => {
            e.preventDefault();
            disconnect();
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
                <th>Send</th>
                <th>Status</th>
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
                  <td>
                    <Button onClick={() => handleSend(line)}>Send</Button>
                  </td>
                  <td className={`align-middle ${line.status === "Done" ? "text-success" : ""}`}>
                    {line.status || ""} {hashLink(line.hash)}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
          {error && <Alert variant="danger">{error}</Alert>}
        </>
      )}
    </div>
  );
}

export default App;
