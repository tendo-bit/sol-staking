"use client";

import * as anchor from '@project-serum/anchor';
import React, { FC, useEffect, useState } from 'react';
import { Button, Col, InputNumber, Row, Tabs } from 'antd';
import { ArrowDownOutlined } from '@ant-design/icons';
import { TOKEN_PROGRAM_ID, ACCOUNT_SIZE, getMinimumBalanceForRentExemptAccount, createInitializeAccountInstruction, getOrCreateAssociatedTokenAccount } from '@solana/spl-token';
import styles from './StakeStep.module.css';
import './stakestep.css';
import { useAnchorProvider } from '../providers/AnchorProvider';
import { PublicKey, SystemProgram, Transaction, Keypair } from '@solana/web3.js';
import idl from '../idls/sol_staking.json';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { notify } from '../services/NotificationService';
import axios from 'axios';
import { CSSObject, StyleProvider } from '@ant-design/cssinjs';
import { BN } from '@project-serum/anchor';

const STAKE_STEP_PROGRAM_ID = '77DkqeM36ceCVqtvY1CnGQ8rSQGazo3bMyajNszJUNLD';

enum TOKEN_SYMBOL {
  STEP = 'SOL' ,
  XSTEP = 'SOL',
  PERCENT = 'Fee %'
}

const YOU_STAKE_TOKEN_TEXT = '';
const YOU_RECEIVE_TOKEN_TEXT = '';

const stepIconUrl = 'https://cryptologos.cc/logos/solana-sol-logo.png?v=032';
const xStepIconUrl = 'https://cryptologos.cc/logos/solana-sol-logo.png?v=032';

enum SubmitButtonText {
  DEFAULT = 'Enter an amount',
  INSUFFICIENT_STEP_BALANCE = 'Insufficient SOL balance',
  INSUFFICIENT_XSTEP_BALANCE = 'Insufficient SOL balance',
  STAKE = 'Stake',
  UNSTAKE = 'Unstake',
}

interface InputPrefixProps {
  iconUrl: string;
  tokenText: string;
  showImg: string;
}

const InputPrefix: FC<InputPrefixProps> = ({ iconUrl, tokenText, showImg ="1" }) => {
  return <div className={styles.stakeStepInputPrefix}>
    { (showImg == '1') && <img alt="" src={iconUrl} /> }
    <span>{tokenText}</span>
  </div>;
};

enum TabType {
  Stake = 'Stake',
  Unstake = 'Unstake',
  Withdraw = 'Withdraw',
  SetFee = 'SetFee'
}

interface TabFormData {
  amountSTEP: string
  amountXSTEP: string;
  type: TabType;
}

interface TabProps {
  type: TabType;
  onFormSubmit: (data: { amountSTEP: string, amountXSTEP: string, type: TabType }) => void;
  stepTokenBalance: number | null;
  xStepTokenBalance: number | null;
  usdStep: number | null;
  usdXStep: number | null;
  stepXStep: string | null;
}

// Inner Tab Component
const Tab: FC<TabProps> = ({ type, stepTokenBalance, xStepTokenBalance, usdStep, usdXStep, stepXStep, onFormSubmit }) => {
  const [amountSTEP, setAmountSTEP] = useState<string | undefined>();
  const [amountXSTEP, setAmountXSTEP] = useState<string | undefined>();
  const [submitButtonText, setSubmitButtonText] = useState<string>(SubmitButtonText.DEFAULT);

  const MAX_STEP_TOKEN_AMOUNT = '1000000000';
  const MAX_XSTEP_TOKEN_AMOUNT = String(Number('1000000000') / Number(stepXStep));

  let stakeStepInfoSTEP = YOU_STAKE_TOKEN_TEXT;
  let stakeStepInfoXSTEP = YOU_RECEIVE_TOKEN_TEXT;

  const antInputNumberTransformer = {
    visit: (cssObj: CSSObject) => {
      const keyToUpdate = 'textAlign';
      if (cssObj['textAlign']) {
        cssObj['textAlign'] = 'right';
      }
      if (cssObj['padding']) {
        cssObj['padding'] = '4px 0 4px 42px';
      }
      return cssObj;
    }
  };

  const handleClick = () => {
    if (amountSTEP && amountXSTEP) {
      onFormSubmit({
        amountSTEP: amountSTEP || '0',
        amountXSTEP: amountXSTEP || '0',
        type
      });
      return;
    }
  };

  const sanitizeInput = (input: string | null) => {
    if (!input) {
      return;
    }
    const numbersAndDots = input.replace(/[^0-9.]/g, '');
    const parts = numbersAndDots.split('.');
    if (parts.length > 1) {
      return parts[0] + '.' + parts.slice(1).join('');
    }
    return numbersAndDots;
  };

  // this can be simplified, I am rushing for time and don't want to break anything!
  const calculateCurrencyConversions = (input: string | undefined, tokenSymbol: TOKEN_SYMBOL) => {
    if (tokenSymbol == TOKEN_SYMBOL.STEP) {
      if (!input) {
        setAmountSTEP(undefined);
        setAmountXSTEP(undefined);
        return;
      }
      const splitInput = input.split('.');
      if (splitInput[1] && splitInput[1].length > 9) {
        input = splitInput[0] + '.' + splitInput[1].slice(0, 9);
      }
      if (Number(input) > Number(MAX_STEP_TOKEN_AMOUNT)) {
        setAmountSTEP(MAX_STEP_TOKEN_AMOUNT);
        return;
      }
      setAmountSTEP(input);
      setAmountXSTEP(parseFloat(String(roundToNDecimals(Number(input) / (Number(stepXStep)), 9) || 0)).toString());
    } else if (String(tokenSymbol) == TOKEN_SYMBOL.XSTEP) {
      if (!input) {
        setAmountSTEP(undefined);
        setAmountXSTEP(undefined);
        return;
      }
      const splitInput = input.split('.');
      if (splitInput[1] && splitInput[1].length > 9) {
        input = splitInput[0] + '.' + splitInput[1].slice(0, 9);
      }
      if (Number(input) > Number(MAX_XSTEP_TOKEN_AMOUNT)) {
        setAmountXSTEP(MAX_XSTEP_TOKEN_AMOUNT);
        return;
      }
      setAmountXSTEP(input);
      setAmountSTEP(parseFloat(String(roundToNDecimals(Number(input) * (Number(stepXStep)), 9) || 0)).toString());
    }
  };

  // general validations, there could be some more as there are other cases to cover
  const validateAndUpdateInput = (input: string | undefined, tokenSymbol: TOKEN_SYMBOL) => {
    calculateCurrencyConversions(input, tokenSymbol);

    if (!input) {
      setSubmitButtonText(SubmitButtonText.DEFAULT);
      return;
    }

    const numberInput = Number(input);
    if (isNaN(numberInput) || numberInput <= 0) {
      setSubmitButtonText(SubmitButtonText.DEFAULT);
      return;
    }

    if (type == TabType.Stake && tokenSymbol == TOKEN_SYMBOL.STEP) {
      if (numberInput > (stepTokenBalance || 0)) {
        setSubmitButtonText(SubmitButtonText.INSUFFICIENT_STEP_BALANCE);
      } else {
        setSubmitButtonText(SubmitButtonText.STAKE);
      }
    }
    if (type == TabType.Unstake && tokenSymbol == TOKEN_SYMBOL.XSTEP) {
      if (numberInput > (xStepTokenBalance || 0)) {
        setSubmitButtonText(SubmitButtonText.INSUFFICIENT_XSTEP_BALANCE);
      } else {
        setSubmitButtonText(SubmitButtonText.UNSTAKE);
      }
    }
  };

  const handleInputChangeSTEP = (value: string | null) => {
    const input = sanitizeInput(value);
    validateAndUpdateInput(input, TOKEN_SYMBOL.STEP);
  };
  const handleInputChangeXSTEP = (value: string | null) => {
    const input = sanitizeInput(value);
    validateAndUpdateInput(input, TOKEN_SYMBOL.XSTEP);
  };
  const roundToNDecimals = (num: number, n: number) => {
    const factor = Math.pow(10, n);
    return Math.floor(num * factor) / factor;
  };

  if (type === TabType.Unstake) {
    stakeStepInfoSTEP = YOU_RECEIVE_TOKEN_TEXT;
    stakeStepInfoXSTEP = YOU_STAKE_TOKEN_TEXT;
  }

  const sections = [
    <div key={0}>
      <div className={styles.stakeStepInfo}>
        <div>{stakeStepInfoSTEP}</div>
        <div>Balance {type === TabType.Unstake ? (xStepTokenBalance || 0) : (stepTokenBalance || 0)}</div>
      </div>
      <div>
        <StyleProvider transformers={[antInputNumberTransformer]}>
          <InputNumber<string>
            onWheel={event => event.currentTarget.blur()}
            onChange={handleInputChangeSTEP}
            min="0"
            type='number'
            max={MAX_STEP_TOKEN_AMOUNT}
            className={styles.stakeStepInput}
            size="large"
            placeholder="0.00"
            autoComplete='off'
            value={amountSTEP}
            prefix={<InputPrefix showImg="1" iconUrl={stepIconUrl} tokenText={TOKEN_SYMBOL.STEP} />}
            stringMode
          />
        </StyleProvider>
      </div>
    </div>,
    <div key={1} className={styles.stakeStepSeparator}>
      <ArrowDownOutlined style={{ fontSize: 24 }} />
    </div>,
    <div key={2}>
      <div className={styles.stakeStepInfo}>
        <div>{stakeStepInfoXSTEP}</div>
        <div>Balance {xStepTokenBalance || 0}</div>
      </div>
      <div>
        <StyleProvider transformers={[antInputNumberTransformer]}>
          <InputNumber<string>
            onWheel={event => event.currentTarget.blur()}
            onChange={handleInputChangeXSTEP}
            min="0"
            type='number'
            max={MAX_XSTEP_TOKEN_AMOUNT}
            className={styles.stakeStepInput}
            size="large"
            placeholder="0.00"
            autoComplete='off'
            value={amountXSTEP}
            prefix={<InputPrefix showImg="1" iconUrl={xStepIconUrl} tokenText={TOKEN_SYMBOL.XSTEP} />}
            stringMode
          />
        </StyleProvider>
      </div>
    </div>
  ];
  if (type === TabType.Unstake) {
    //  sections.reverse();
  }

  return <div>
    {sections[0]}
    {/* {sections[1]}
    {sections[2]} */}
    <div className={styles.stakeStepSubmit}>
      <Button disabled={
        submitButtonText === SubmitButtonText.DEFAULT ||
        submitButtonText === SubmitButtonText.INSUFFICIENT_STEP_BALANCE ||
        submitButtonText === SubmitButtonText.INSUFFICIENT_XSTEP_BALANCE
      } block type="primary" onClick={handleClick}>{submitButtonText}</Button>
    </div>
  </div>;
};

const TabAdmin: FC<TabProps> = ({ type, stepTokenBalance, xStepTokenBalance, usdStep, usdXStep, stepXStep, onFormSubmit }) => {
  const [amountSTEP, setAmountSTEP] = useState<string | undefined>();
  const [amountXSTEP, setAmountXSTEP] = useState<string | undefined>();
  const [submitButtonText, setSubmitButtonText] = useState<string>(SubmitButtonText.DEFAULT);

  const MAX_STEP_TOKEN_AMOUNT = '1000000000';
  const MAX_PERCENT= '10';
  const MAX_XSTEP_TOKEN_AMOUNT = String(Number('1000000000') / Number(stepXStep));

  let stakeStepInfoSTEP = YOU_STAKE_TOKEN_TEXT;
  let stakeStepInfoXSTEP = YOU_RECEIVE_TOKEN_TEXT;

  const antInputNumberTransformer = {
    visit: (cssObj: CSSObject) => {
      const keyToUpdate = 'textAlign';
      if (cssObj['textAlign']) {
        cssObj['textAlign'] = 'right';
      }
      if (cssObj['padding']) {
        cssObj['padding'] = '4px 0 4px 42px';
      }
      return cssObj;
    }
  };

  const handleClick = (realType: String) => {

      if ( realType === '1' ) {
        onFormSubmit({
          amountSTEP: amountSTEP || '0',
          amountXSTEP: amountXSTEP || '0',
          type: TabType.Withdraw
        });
      }
      else {
        if (amountSTEP) {
          onFormSubmit({
            amountSTEP: amountSTEP || '0',
            amountXSTEP: amountXSTEP || '0',
            type: TabType.SetFee
          });
        }
      }
      return;
  };

  const sanitizeInput = (input: string | null) => {
    if (!input) {
      return;
    }
    const numbersAndDots = input.replace(/[^0-9.]/g, '');
    const parts = numbersAndDots.split('.');
    if (parts.length > 1) {
      return parts[0] + '.' + parts.slice(1).join('');
    }
    return numbersAndDots;
  };

  // this can be simplified, I am rushing for time and don't want to break anything!
  const calculateCurrencyConversions = (input: string | undefined, tokenSymbol: TOKEN_SYMBOL) => {
    if (tokenSymbol == TOKEN_SYMBOL.STEP) {
      if (!input) {
        setAmountSTEP(undefined);
        setAmountXSTEP(undefined);
        return;
      }
      const splitInput = input.split('.');
      if (splitInput[1] && splitInput[1].length > 9) {
        input = splitInput[0] + '.' + splitInput[1].slice(0, 9);
      }
      if (Number(input) > Number(MAX_STEP_TOKEN_AMOUNT)) {
        setAmountSTEP(MAX_STEP_TOKEN_AMOUNT);
        return;
      }
      setAmountSTEP(input);
      setAmountXSTEP(parseFloat(String(roundToNDecimals(Number(input) / (Number(stepXStep)), 9) || 0)).toString());
    } else if (String(tokenSymbol) == TOKEN_SYMBOL.XSTEP) {
      if (!input) {
        setAmountSTEP(undefined);
        setAmountXSTEP(undefined);
        return;
      }
      const splitInput = input.split('.');
      if (splitInput[1] && splitInput[1].length > 9) {
        input = splitInput[0] + '.' + splitInput[1].slice(0, 9);
      }
      if (Number(input) > Number(MAX_XSTEP_TOKEN_AMOUNT)) {
        setAmountXSTEP(MAX_XSTEP_TOKEN_AMOUNT);
        return;
      }
      setAmountXSTEP(input);
      setAmountSTEP(parseFloat(String(roundToNDecimals(Number(input) * (Number(stepXStep)), 9) || 0)).toString());
    }
  };

  // general validations, there could be some more as there are other cases to cover
  const validateAndUpdateInput = (input: string | undefined, tokenSymbol: TOKEN_SYMBOL) => {
    calculateCurrencyConversions(input, tokenSymbol);

    if (!input) {
      setSubmitButtonText(SubmitButtonText.DEFAULT);
      return;
    }

    const numberInput = Number(input);
    if (isNaN(numberInput) || numberInput <= 0) {
      setSubmitButtonText(SubmitButtonText.DEFAULT);
      return;
    }

    if (type == TabType.Stake && tokenSymbol == TOKEN_SYMBOL.STEP) {
      if (numberInput > (stepTokenBalance || 0)) {
        setSubmitButtonText(SubmitButtonText.INSUFFICIENT_STEP_BALANCE);
      } else {
        setSubmitButtonText(SubmitButtonText.STAKE);
      }
    }
    if (type == TabType.Unstake && tokenSymbol == TOKEN_SYMBOL.XSTEP) {
      if (numberInput > (xStepTokenBalance || 0)) {
        setSubmitButtonText(SubmitButtonText.INSUFFICIENT_XSTEP_BALANCE);
      } else {
        setSubmitButtonText(SubmitButtonText.UNSTAKE);
      }
    }
  };

  const handleInputChangeSTEP = (value: string | null) => {
    const input = sanitizeInput(value);
    validateAndUpdateInput(input, TOKEN_SYMBOL.STEP);
  };
  const handleInputChangeXSTEP = (value: string | null) => {
    const input = sanitizeInput(value);
    validateAndUpdateInput(input, TOKEN_SYMBOL.XSTEP);
  };
  const roundToNDecimals = (num: number, n: number) => {
    const factor = Math.pow(10, n);
    return Math.floor(num * factor) / factor;
  };

  if (type === TabType.Unstake) {
    stakeStepInfoSTEP = YOU_RECEIVE_TOKEN_TEXT;
    stakeStepInfoXSTEP = YOU_STAKE_TOKEN_TEXT;
  }

  const sections = [
    <div key={0}>
      <div>
        <StyleProvider transformers={[antInputNumberTransformer]}>
          <InputNumber<string>
            onWheel={event => event.currentTarget.blur()}
            onChange={handleInputChangeSTEP}
            min="0"
            type='number'
            max={MAX_PERCENT}
            className={styles.stakeStepInput}
            size="large"
            placeholder="0"
            autoComplete='off'
            value={amountSTEP}
            stringMode
            prefix={<InputPrefix showImg="0" iconUrl='' tokenText={TOKEN_SYMBOL.PERCENT} />}
          />
        </StyleProvider>
      </div>
    </div>
  ];
  if (type === TabType.Unstake) {
    // sections.reverse();
  }

  return <div>
    {sections[0]}
    <div className={styles.stakeStepSubmit}>
      <Button disabled={
        amountSTEP == null || amountSTEP == '0'
      } block type="primary" onClick={(e)=>{handleClick('0');}}>S   E   T</Button>
    </div>
    <div className={styles.stakeStepSubmit}>
      <Button block type="primary" onClick={(e)=>{handleClick('1');}}>Withdraw All Fee</Button>
    </div>
  </div>;
};

// Staking component
export const StakeStep: FC = () => {
  const [tokenAccountBalanceSTEP, setTokenAccountBalanceSTEP] = useState<number | null>(null);
  const [tokenAccountBalanceXSTEP, setTokenAccountBalanceXSTEP] = useState<number | null>(null);
  const [userTokenAccountSTEP, setUserTokenAccountSTEP] = useState<PublicKey>();
  const [userTokenAccountXSTEP, setUserTokenAccountXSTEP] = useState<PublicKey>();
  const [usdStepPrice, setUsdStepPrice] = useState<number | null>(null);
  const [usdXStepPrice, setUsdXStepPrice] = useState<number | null>(null);
  const [stepXStepPrice, setStepXStepPrice] = useState<string | null>(null);
  const [program, setProgram] = useState<anchor.Program | null>(null);

  const { wallet, sendTransaction, publicKey } = useWallet();
  const { connection } = useConnection();

  const anchorProvider = useAnchorProvider();

  const TOKEN_MINT_ADDRESS_STEP = new PublicKey('StepAscQoEioFxxWGnh2sLBDFp9d8rvKz2Yp39iDpyT');
  const TOKEN_MINT_ADDRESS_XSTEP = new PublicKey('xStpgUCss9piqeFUk2iLVcvJEGhAdJxJQuwLkXP555G');
  const STAKE_STEP_PROGRAM_ID_ADDRESS = new PublicKey(STAKE_STEP_PROGRAM_ID);

  const contractCall = async (data: TabFormData): Promise<string> => {
    if (!anchorProvider || !anchorProvider.publicKey) {
      throw new Error('anchorProvider is not ready or available');
    }
    if (!program) {
      throw new Error('program is not ready or available');
    }

    if (data.type === TabType.Stake) {
      if(!publicKey)throw "err";
      const user = new PublicKey(publicKey.toBase58());
      let seeds = [
        Buffer.from("stake-entry"),
        user.toBuffer()
      ];
      let stakeEntryPda = await anchor.web3.PublicKey.findProgramAddressSync(seeds, STAKE_STEP_PROGRAM_ID_ADDRESS);
      let stakeEntryData = await program.account.stakeEntry.fetchNullable(stakeEntryPda[0]);
      if ( !stakeEntryData ) {
        let accounts = {
          user,
          stakeEntry: stakeEntryPda[0],
          systemProgram: anchor.web3.SystemProgram.programId
        };
    
        const tx = await program.methods
          .createStakeEntry()
          .accounts(accounts)
          .signers([])
          .rpc();
      }
      const DECIMALS = 9;
      let amount = data.amountSTEP ;
      let amountStr = ((Number(amount) * 1.0) * 10 ** DECIMALS).toString();
      let solAmount = new BN(amountStr);

      let globalDataSeeds = [
        Buffer.from("global-data")
      ];
      let globalDataPda = await anchor.web3.PublicKey.findProgramAddressSync(globalDataSeeds, STAKE_STEP_PROGRAM_ID_ADDRESS);

      let vaultSeeds = [
        Buffer.from("vault")
      ];
      let vaultPda = await anchor.web3.PublicKey.findProgramAddressSync(vaultSeeds, STAKE_STEP_PROGRAM_ID_ADDRESS);

      let accounts = {
        staker: user,
        globalData: globalDataPda[0],
        vault: vaultPda[0],
        stakeEntry: stakeEntryPda[0],
        systemProgram: anchor.web3.SystemProgram.programId
      };

      const tx = await program.methods
        .stake(solAmount)
        .accounts(accounts)
        .signers([])
        .rpc();

      const balance = await connection.getBalance(new PublicKey(publicKey.toBase58()));
      setTokenAccountBalanceSTEP(balance / 1e9);
      
      stakeEntryData = await program.account.stakeEntry.fetchNullable(stakeEntryPda[0]);
      if(!stakeEntryData)throw "err";
      setTokenAccountBalanceXSTEP(new BN(stakeEntryData.balance).toNumber() / 1e9);
      
      return tx;

    } else if (data.type === TabType.Unstake) {
      const DECIMALS = 9;
      if(!publicKey)throw "err";
      const user = new PublicKey(publicKey.toBase58());

      let amount = data.amountSTEP;
      let amountStr = ((Number(amount) * 1.0) * 10 ** DECIMALS).toString();
      let solAmount = new BN(amountStr);

      let vaultSeeds = [
        Buffer.from("vault")
      ];
      let vaultPda = await anchor.web3.PublicKey.findProgramAddressSync(vaultSeeds, STAKE_STEP_PROGRAM_ID_ADDRESS);

      let stakeEntrySeeds = [
        Buffer.from("stake-entry"),
        user.toBuffer()
      ];
      let stakeEntryPda = await anchor.web3.PublicKey.findProgramAddressSync(stakeEntrySeeds, STAKE_STEP_PROGRAM_ID_ADDRESS);

      let accounts = {
        staker: user,
        vault: vaultPda[0],
        stakeEntry: stakeEntryPda[0],
        systemProgram: anchor.web3.SystemProgram.programId
      };

      const tx = await program.methods
        .unstake(solAmount, vaultPda[1])
        .accounts(accounts)
        .signers([])
        .rpc();

      console.log(tx);
      const balance = await connection.getBalance(new PublicKey(publicKey.toBase58()));
      setTokenAccountBalanceSTEP(balance / 1e9);
      
      let stakeEntryData = await program.account.stakeEntry.fetchNullable(stakeEntryPda[0]);
      if(!stakeEntryData)throw "err";
      setTokenAccountBalanceXSTEP(new BN(stakeEntryData.balance).toNumber() / 1e9);

      return tx;
    } else if (data.type === TabType.Withdraw) {
      if(!publicKey)throw "err";
      const admin = new PublicKey(publicKey.toBase58());
      let globalDataSeeds = [
        Buffer.from("global-data")
      ];

      let globalDataPda = await anchor.web3.PublicKey.findProgramAddressSync(globalDataSeeds, STAKE_STEP_PROGRAM_ID_ADDRESS);
  
      let vaultSeeds = [
        Buffer.from("vault")
      ];
      let vaultPda = await anchor.web3.PublicKey.findProgramAddressSync(vaultSeeds, STAKE_STEP_PROGRAM_ID_ADDRESS);
  
      let accounts = {
        admin,
        globalData: globalDataPda[0],
        vault: vaultPda[0],
        systemProgram: anchor.web3.SystemProgram.programId
      };
         const tx = await program.methods
        .withdrawFee(vaultPda[1])
        .accounts(accounts)
        .rpc();
      
      let globalData_data = await program.account.globalData.fetchNullable(globalDataPda[0]);
      if(!globalData_data)throw "err";
      console.log(new BN(globalData_data.feeAmount).toNumber());

      return tx;
    } else if (data.type === TabType.SetFee) {
      if(!publicKey)throw "err";
      const admin = new PublicKey(publicKey.toBase58());
      let percent = new BN(data.amountSTEP);

      let globalDataSeeds = [
        Buffer.from("global-data")
      ];
      let globalDataPda = await anchor.web3.PublicKey.findProgramAddressSync(globalDataSeeds, STAKE_STEP_PROGRAM_ID_ADDRESS);

      let accounts = {
        admin,
        globalData: globalDataPda[0],
        systemProgram: anchor.web3.SystemProgram.programId
      };

      const tx = await program.methods
        .setFeePercent(percent)
        .accounts(accounts)
        .rpc();
      
      let globalData_data = await program.account.globalData.fetchNullable(globalDataPda[0]);
      if(!globalData_data)throw "err";
      console.log(new BN(globalData_data.feePercent).toNumber());

      return tx;
    }

    let amount: string | number = 0;
    const seeds = [TOKEN_MINT_ADDRESS_STEP.toBuffer()];
    const [tokenVaultPda, nonce] = PublicKey.findProgramAddressSync(seeds, STAKE_STEP_PROGRAM_ID_ADDRESS);
    const params: any = {
      tokenMint: TOKEN_MINT_ADDRESS_STEP,
      xTokenMint: TOKEN_MINT_ADDRESS_XSTEP,
      tokenFromAuthority: anchorProvider.publicKey,
      tokenProgram: TOKEN_PROGRAM_ID,
      tokenVault: tokenVaultPda
    };

    let tokenAccountCreationInstructions: anchor.web3.TransactionInstruction[] = [];
    let tokenAccountKeypair: Keypair | undefined;

    // TODO: this can be simplified
    if (data.type === TabType.Stake) {
      amount = data.amountSTEP || amount;
      params.tokenFrom = userTokenAccountSTEP;
      params.xTokenTo = userTokenAccountXSTEP;
      if (!userTokenAccountXSTEP) {
        const { instructions, tokenAccount } = await createTokenAccountInstructions(TOKEN_MINT_ADDRESS_XSTEP);
        tokenAccountKeypair = tokenAccount;
        tokenAccountCreationInstructions = instructions;
        params.xTokenTo = tokenAccountKeypair.publicKey;
      }
    } else if (data.type === TabType.Unstake) {
      amount = data.amountXSTEP || amount;
      params.tokenTo = userTokenAccountSTEP;
      params.xTokenFrom = userTokenAccountXSTEP;
      if (!userTokenAccountSTEP) {
        const { instructions, tokenAccount } = await createTokenAccountInstructions(TOKEN_MINT_ADDRESS_STEP);
        tokenAccountKeypair = tokenAccount;
        tokenAccountCreationInstructions = instructions;
        params.xTokenFrom = tokenAccountKeypair.publicKey;
      }
    }

    const bigNumberAmountWithoutDecimals = new anchor.BN(Number(amount) * 1e9);
    const instruction = await program.methods[String(data.type).toLowerCase()](nonce, bigNumberAmountWithoutDecimals)
      .accounts(params)
      .instruction();

    const {
      context: { slot: minContextSlot },
      value: { blockhash, lastValidBlockHeight }
    } = await connection.getLatestBlockhashAndContext();

    const transaction = new Transaction({
      feePayer: anchorProvider.publicKey,
      blockhash,
      lastValidBlockHeight
    });

    // Combine the tokenAccount creation instructions and main stake/unstake instruction
    for (const instruction of tokenAccountCreationInstructions) {
      transaction.add(instruction);
    }
    transaction.add(instruction);

    transaction.recentBlockhash = blockhash;

    // Sign the transaction with the user's wallet and the new account's keypair if there is one
    if (tokenAccountKeypair) {
      transaction.partialSign(tokenAccountKeypair);
    }

    let newStepXStepPrice: string | undefined;
    try {
      const simulationResult = await connection.simulateTransaction(transaction);
      const eventParser = new anchor.EventParser(program.programId, new anchor.BorshCoder(program.idl));
      const events = eventParser.parseLogs(simulationResult.value.logs || []);
      for (let event of events) {
        if (event.name === 'PriceChange') {
          newStepXStepPrice = event.data.stepPerXstep;
        }
      }
      if (simulationResult.value.err) {
        console.error("Transaction simulation failed:", simulationResult.value.err);
      }
    } catch (error) {
      throw error;
    }

    // Send the transaction
    const signature = await sendTransaction(transaction, connection, { minContextSlot });

    // Confirm the transaction
    await connection.confirmTransaction({
      blockhash, lastValidBlockHeight, signature
    });

    // update pair info but don't get step price, we have it
    await updateCurrencies(newStepXStepPrice);

    // check this case one more time after tx success
    // update the price of the new token account we just sent to
    if (tokenAccountKeypair) {
      if (data.type === TabType.Stake) {
        setUserTokenAccountXSTEP(tokenAccountKeypair.publicKey);
        const response = await connection.getTokenAccountBalance(tokenAccountKeypair.publicKey);
        setTokenAccountBalanceXSTEP(response.value.uiAmount);
      } else if (data.type === TabType.Unstake) {
        const response = await connection.getTokenAccountBalance(tokenAccountKeypair.publicKey);
        setTokenAccountBalanceSTEP(response.value.uiAmount);
      }
    }
    if(!publicKey)throw "err";
    const balance = await connection.getBalance(new PublicKey(publicKey.toBase58()));
    setTokenAccountBalanceSTEP(balance / 1e9);

    return signature;
  };

  const createTokenAccountInstructions = async (mintPublicKey: PublicKey): Promise<{ tokenAccount: Keypair, instructions: anchor.web3.TransactionInstruction[] }> => {
    if (!anchorProvider) {
      throw new Error('anchor provider not available');
    }
    if (!connection) {
      throw new Error('wallet adapter connection not available');
    }
    const { publicKey } = anchorProvider;
    if (!publicKey) {
      throw new Error('wallet publicKey is not ready or available');
    }
    if (!wallet) {
      throw new Error('wallet adapter is not ready or available but should be');
    }

    const newAccount = Keypair.generate();

    const instructions: anchor.web3.TransactionInstruction[] = [
      SystemProgram.createAccount({
        fromPubkey: publicKey,
        newAccountPubkey: newAccount.publicKey,
        lamports: await getMinimumBalanceForRentExemptAccount(connection),
        space: ACCOUNT_SIZE,
        programId: TOKEN_PROGRAM_ID,
      }),
      createInitializeAccountInstruction(
        newAccount.publicKey,
        mintPublicKey,
        publicKey,
        TOKEN_PROGRAM_ID,
      )
    ];

    return { tokenAccount: newAccount, instructions };
  };

  const handleFormSubmit = async (data: TabFormData) => {
    console.log("1111");
    try {
      const tx = await contractCall(data);
      notify.success(`${data.type} Transaction was successful`, <span>Open in explorer: <a target="_blank" href={`https://explorer.solana.com/tx/${tx}`}>{tx}</a></span>);
    } catch (err) {
      notify.error('Transaction failed', String(err));
    }
  };


  // handles all currency updates
  const updateCurrencies = async (stepXStepPairPrice?: string) => {
    if (!anchorProvider) {
      throw new Error('anchorProvider not ready oravailable');
    }
    if (!program) {
      throw new Error('program not available');
    }

    if (stepXStepPairPrice) {
      setStepXStepPrice(stepXStepPairPrice);
    } else {
      const seeds = [TOKEN_MINT_ADDRESS_STEP.toBuffer()];
      const [tokenVaultPda] = PublicKey.findProgramAddressSync(seeds, STAKE_STEP_PROGRAM_ID_ADDRESS);
      const transaction = await program.methods['emitPrice']()
        .accounts({
          tokenMint: TOKEN_MINT_ADDRESS_STEP,
          xTokenMint: TOKEN_MINT_ADDRESS_XSTEP,
          tokenVault: tokenVaultPda,
        }).transaction();
      transaction.feePayer = anchorProvider.publicKey;
      const simulationResult = await connection.simulateTransaction(transaction);
      const eventParser = new anchor.EventParser(program.programId, new anchor.BorshCoder(program.idl));
      const events = eventParser.parseLogs(simulationResult.value.logs || []);
      for (let event of events) {
        if (event.name === 'Price') {
          setStepXStepPrice(event.data.stepPerXstep);
          break;
        }
      }
      if (simulationResult.value.err) {
        console.error("Transaction simulation failed:", simulationResult.value.err);
      }
    }

    const tokenMintAddressStepString = TOKEN_MINT_ADDRESS_STEP.toString();
    const tokenMintAddressXStepString = TOKEN_MINT_ADDRESS_XSTEP.toString();

    const response = await axios.get(`https://api.geckoterminal.com/api/v2/simple/networks/solana/token_price/${tokenMintAddressStepString}%2C${tokenMintAddressXStepString}`);
    const usdPriceInfoStep = response.data?.data?.attributes?.token_prices?.[tokenMintAddressStepString];
    const usdPriceInfoXStep = response.data?.data?.attributes?.token_prices?.[tokenMintAddressXStepString];

    setUsdStepPrice(parseFloat(usdPriceInfoStep));
    setUsdXStepPrice(parseFloat(usdPriceInfoXStep));

    if (userTokenAccountSTEP) {
      const response = await connection.getTokenAccountBalance(userTokenAccountSTEP);
      setTokenAccountBalanceSTEP(response.value.uiAmount);
    }
    if(!publicKey)throw 'err';
    const balance = await connection.getBalance(new PublicKey(publicKey.toBase58()));
    setTokenAccountBalanceSTEP(balance / 1e9);
    if (userTokenAccountXSTEP) {
      const response = await connection.getTokenAccountBalance(userTokenAccountXSTEP);
      setTokenAccountBalanceXSTEP(response.value.uiAmount);
    }
  };

  // set the program
  useEffect(() => {
    if (anchorProvider && !program) {
      setProgram(new anchor.Program(idl as anchor.Idl, STAKE_STEP_PROGRAM_ID_ADDRESS, anchorProvider));
    }
  }, [anchorProvider, program]);

  // handle currency pair info
  useEffect(() => {
    if (anchorProvider && program) {
      const callUpdateCurrencyPairs = async () => {
        try {
          await updateCurrencies();
        } catch (error) {
          console.error(error);
        }
      };
      callUpdateCurrencyPairs();
    }
  }, [program]);

  // get user token accounts and info
  useEffect(() => {
    let isSubscribed = true;  // Flag to track mounted state

    const findUserTokenAccount = async () => {
      if (anchorProvider && anchorProvider.publicKey) {
        try {
          const [accountsSTEP, accountsXSTEP] = await Promise.all([
            anchorProvider.connection.getParsedTokenAccountsByOwner(anchorProvider.publicKey, { programId: TOKEN_PROGRAM_ID, mint: TOKEN_MINT_ADDRESS_STEP }),
            anchorProvider.connection.getParsedTokenAccountsByOwner(anchorProvider.publicKey, { programId: TOKEN_PROGRAM_ID, mint: TOKEN_MINT_ADDRESS_XSTEP })
          ]);

          // Process accountsSTEP
          const userTokenAccountInfoSTEP = accountsSTEP.value.find(account => account.account.data.parsed.info.mint === TOKEN_MINT_ADDRESS_STEP.toString());
          const stepBalance = userTokenAccountInfoSTEP?.account.data.parsed.info.tokenAmount.uiAmount;
          setUserTokenAccountSTEP(userTokenAccountInfoSTEP?.pubkey);

          // Process accountsXSTEP
          const userTokenAccountInfoXSTEP = accountsXSTEP.value.find(account => account.account.data.parsed.info.mint === TOKEN_MINT_ADDRESS_XSTEP.toString());
          const xStepBalance = userTokenAccountInfoXSTEP?.account.data.parsed.info.tokenAmount.uiAmount;
          setUserTokenAccountXSTEP(userTokenAccountInfoXSTEP?.pubkey);

          if (isSubscribed) {
            if(!publicKey)throw "err";
            const balance = await connection.getBalance(new PublicKey(publicKey.toBase58()));
            setTokenAccountBalanceSTEP(balance / 1e9);

            const user = new PublicKey(publicKey.toBase58());
            let seeds = [
              Buffer.from("stake-entry"),
              user.toBuffer()
            ];
            let stakeEntryPda = await anchor.web3.PublicKey.findProgramAddressSync(seeds, STAKE_STEP_PROGRAM_ID_ADDRESS);
            if(!program)throw "err";
            let stakeEntryData = await program.account.stakeEntry.fetchNullable(stakeEntryPda[0]);
            if(!stakeEntryData)throw "err";
            setTokenAccountBalanceXSTEP(new BN(stakeEntryData.balance).toNumber() / 1e9);
          }
        } catch (error) {
          console.error('Error fetching token accounts:', error);
        }
      }
    };

    findUserTokenAccount();

    return () => {
      isSubscribed = false;
    };
  }, [anchorProvider]);

  const items = [
    {
      label: TabType.Stake,
      key: '1',
      children: <Tab type={TabType.Stake} stepTokenBalance={tokenAccountBalanceSTEP} xStepTokenBalance={tokenAccountBalanceXSTEP} usdStep={usdStepPrice} usdXStep={usdXStepPrice} stepXStep={stepXStepPrice} onFormSubmit={handleFormSubmit} />
    },
    {
      label: TabType.Unstake,
      key: '2',
      children: <Tab type={TabType.Unstake} stepTokenBalance={tokenAccountBalanceSTEP} xStepTokenBalance={tokenAccountBalanceXSTEP} usdStep={usdStepPrice} usdXStep={usdXStepPrice} stepXStep={stepXStepPrice} onFormSubmit={handleFormSubmit} />
    },
    {
      label: TabType.Withdraw,
      key: '3',
      children: <TabAdmin type={TabType.Stake} stepTokenBalance={tokenAccountBalanceSTEP} xStepTokenBalance={tokenAccountBalanceXSTEP} usdStep={usdStepPrice} usdXStep={usdXStepPrice} stepXStep={stepXStepPrice} onFormSubmit={handleFormSubmit} />
    }
  ];

  return (
    <div>
      <Row>
        <Col span={24}>
          <div className={styles.stakeStep}>
            <h2>SOL Staking</h2>
            <Tabs
              defaultActiveKey="1"
              type="card"
              size={'large'}
              items={items}
            />
          </div>
        </Col>
      </Row>
    </div>
  );
};