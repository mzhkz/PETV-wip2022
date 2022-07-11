import express from "express";
import ethers from "ethers";
import multer from "multer";
import fs from "fs";
import os from "os";

import PERVArtifact from "./dest/PERV.json";
import PERVAddress from "./dest/PERV-address.json";

const app: express.Express = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
const upload = multer({ dest: os.tmpdir() });

const url = "http://localhost:8465";
const provider = new ethers.providers.JsonRpcProvider(url);
const _wallet: ethers.Wallet = new ethers.Wallet(
	"0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a"
);
const wallet = _wallet.connect(provider);
const contract = new ethers.Contract(
	PERVAddress.address as string,
	PERVArtifact.abi as any,
	wallet
);

// 辞書オブジェクトを作成する
const nonces: { [hashed_b_nonce: string]: string } = {};

app.listen(3000, () => {
	console.log("Start on port 3000.");
});

type RequestNonce = {
	hex_hashed_a_nonce: string;
};

type UploadFile = {
	hex_hashed_b_nonce: string;
};

type GetDataParams = {
	hex_hashed_data: string;
};

app.post(
	"/req_nonce",
	async (req: express.Request<RequestNonce>, res: express.Response) => {
		const hex_hashed_a_nonce = req.body.hex_hashed_a_nonce;
		const binary_hashed_a_nonce = ethers.utils.arrayify(hex_hashed_a_nonce);
		const hex_b_signed_hashed_nonce = await wallet.signMessage(
			binary_hashed_a_nonce
		);
		const hex_b_public_key = wallet.publicKey;
		const hex_hashed_b_nonce = ethers.utils.sha256(
			hex_hashed_a_nonce + "server"
		);

		nonces[hex_hashed_b_nonce] = hex_hashed_a_nonce;
		res.json({
			hex_b_sig_hash_a_nonce: hex_b_signed_hashed_nonce,
			hex_b_public_key: hex_b_public_key,
			hex_hashed_b_nonce: hex_hashed_b_nonce,
		});
	}
);

app.post(
	"/upload_file",
	upload.single("file"),
	async (
		req: express.Request<UploadFile>,
		res: express.Response,
		next: express.NextFunction
	) => {
		const hex_hashed_b_nonce = req.body.hex_hashed_b_nonce;
		if (nonces[hex_hashed_b_nonce] === undefined) {
			res.status(401).json("not correct hex_hashed_b_nonce value.");
		}
		const file_path = req.file.path;
		const buffer = await fs.readFileSync(file_path);
		const hex_hashed_data = ethers.utils.keccak256(buffer);
		const dataurl = "http://localhost:3000/" + hex_hashed_data;
		const hex_dataurl = ethers.utils.hexlify(ethers.utils.toUtf8Bytes(dataurl));
		const hex_hashed_dataurl = ethers.utils.keccak256(hex_dataurl);
		const binary_hashed_dataurl = ethers.utils.arrayify(hex_hashed_dataurl);
		const binary_dataurl = ethers.utils.arrayify(hex_dataurl);
		const hex_B_signed_dataurl = await wallet.signMessage(
			binary_hashed_dataurl
		);
		const hex_hashed_a_nonce = nonces[hex_hashed_b_nonce];
		const binary_hashed_nonce = ethers.utils.arrayify(hex_hashed_a_nonce);

		//send transaction
		const tx = await contract.putIntent(
			binary_dataurl,
			binary_hashed_dataurl,
			hex_B_signed_dataurl,
			binary_hashed_nonce
		);
		await tx.wait();
		res.send({
			dataurl: dataurl,
		});
	}
);

app.get(
	"/hash/:data_hash",
	(req: express.Request<GetDataParams>, res: express.Response) => {
		res.json("success");
	}
);
