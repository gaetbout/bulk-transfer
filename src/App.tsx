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
  const [fileName, setFileName] = useState<string>("");

  wallet?.on("networkChanged", (accounts: string[]) => {
    console.log("networkChanged", accounts);
  });

  async function connectWallet() {
    const wallet = await connect({ include: ["argentX"] });
    if (!wallet) {
      return;
    }
    setWallet(wallet);
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

    setFileName(files[0].name);

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
      const { result } = await wallet?.provider?.callContract({ contractAddress: TokenAddress, entrypoint: "decimals" });
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
      <div className="App">
        <div className="connect-container">
          <div>
            <h1 className="app-title">Starknet Disperse</h1>
            <p className="app-subtitle">Bulk token transfer made simple</p>
          </div>
          <Button onClick={connectWallet} className="connect-btn">
            Connect Wallet
          </Button>
        </div>
      </div>
    );
  }

  const address = wallet.account.address;
  return (
    <div className="App px-3 py-4">
      <div className="container" style={{ maxWidth: 1200 }}>
        <h1 className="app-title compact">Starknet Disperse</h1>
        
        <div className="header-section">
          <div className="wallet-info">
            <div>
              <span className="wallet-address">
                {address!.slice(0, 8)}...{address!.slice(-6)}
              </span>
            </div>
            <div>
              <span className="network-badge">{wallet.chainId}</span>
            </div>
            <div>
              <a
                href="/"
                className="disconnect-link"
                onClick={async (e) => {
                  e.preventDefault();
                  await disconnect();
                  setWallet(undefined);
                }}
              >
                Disconnect
              </a>
            </div>
          </div>
          
          <div className="upload-section">
            <div className="file-input-wrapper">
              <input 
                id="formFileLg" 
                type="file" 
                accept=".csv"
                onChange={handleChangeFile} 
              />
              <label htmlFor="formFileLg" className="file-input-label">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M10 4V16M10 4L6 8M10 4L14 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M4 17H16" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
                Choose CSV File
              </label>
              <div className="file-name">{fileName && `Selected: ${fileName}`}</div>
            </div>
          </div>

          {lines && (
            <div className="table-section">
              <Table striped bordered hover size="sm">
                <thead>
                  <tr>
                    <th className="col-name">To</th>
                    <th className="col-address">ToAddress</th>
                    <th className="col-token">Token</th>
                    <th className="col-address">TokenAddress</th>
                    <th className="col-amount">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, index) => (
                    <tr key={index}>
                      <td className="align-middle col-name">{line.To}</td>
                      <td className="align-middle col-address">
                        {line.ToAddress}
                      </td>
                      <td className="align-middle col-token">{line.Token}</td>
                      <td className="align-middle col-address">
                        {line.TokenAddress}
                      </td>
                      <td className="align-middle col-amount">{line.Amount}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          )}
        </div>

        {lines && (
          <>
            <Button onClick={() => handleSend(lines)} className="send-btn">
              Send Transfers
            </Button>
            {status && <Alert variant="info">{status}</Alert>}
            {error && <Alert variant="danger">{error}</Alert>}
          </>
        )}
      </div>
    </div>
  );
}

export default App;
