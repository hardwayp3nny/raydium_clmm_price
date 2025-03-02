const { Connection, PublicKey } = require('@solana/web3.js');
const { PoolInfoLayout } = require('@raydium-io/raydium-sdk-v2');
const { SqrtPriceMath } = require('@raydium-io/raydium-sdk-v2');
const { AccountLayout } = require('@solana/spl-token');
const BN = require('bn.js');
const Decimal = require('decimal.js');
const { PerformanceMonitor } = require('./src/detailed');

type PublicKeyType = typeof PublicKey;
type ConnectionType = typeof Connection;
type BNType = typeof BN;
type DecimalType = typeof Decimal;
type PerformanceMonitorType = typeof PerformanceMonitor;

const RPC_ENDPOINT = 'https://mainnet.helius-rpc.com/?api-key=177e861e-680b-4c8f-9e7c-a41c87c43968';
const CLMM_PROGRAM_ID = new PublicKey('CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK');

const KNOWN_TOKENS: {[key: string]: {symbol: string, name: string}} = {
  'So11111111111111111111111111111111111111112': { symbol: 'SOL', name: 'Wrapped SOL' },
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': { symbol: 'USDC', name: 'USD Coin' },
};

class ClmmPoolAnalyzer {
  private connection: InstanceType<ConnectionType>;
  private perfMonitor: InstanceType<PerformanceMonitorType>;

  constructor(rpcEndpoint: string) {
    this.connection = new Connection(rpcEndpoint, 'confirmed');
    this.perfMonitor = new PerformanceMonitor();
  }

  async getPoolBasicInfo(poolId: string): Promise<any> {
    console.log(`开始获取池子基本信息: ${poolId}`);
    this.perfMonitor.start();
    this.perfMonitor.markStart('total');
    const poolAddress = new PublicKey(poolId);

    try {
      this.perfMonitor.markStart('fetchPoolInfo');
      const poolAccountInfo = await this.connection.getAccountInfo(poolAddress);
      this.perfMonitor.markEnd('fetchPoolInfo');
      
      if (!poolAccountInfo) {
        throw new Error('池子账户不存在');
      }

      this.perfMonitor.markStart('decodePoolInfo');
      const poolInfo = PoolInfoLayout.decode(poolAccountInfo.data);
      this.perfMonitor.markEnd('decodePoolInfo');

      const mintAAddress = poolInfo.mintA.toString();
      const mintBAddress = poolInfo.mintB.toString();
      
      const tokenAInfo = KNOWN_TOKENS[mintAAddress] || { 
        symbol: `Token-${mintAAddress.slice(0, 4)}`, 
        name: `Unknown Token (${poolInfo.mintDecimalsA} decimals)` 
      };
      
      const tokenBInfo = KNOWN_TOKENS[mintBAddress] || { 
        symbol: `Token-${mintBAddress.slice(0, 4)}`, 
        name: `Unknown Token (${poolInfo.mintDecimalsB} decimals)` 
      };

      const currentPrice = SqrtPriceMath.sqrtPriceX64ToPrice(
        poolInfo.sqrtPriceX64,
        poolInfo.mintDecimalsA,
        poolInfo.mintDecimalsB
      );

      this.perfMonitor.markStart('fetchTokenBalances');
      // const [vaultAInfo, vaultBInfo] = await this.connection.getMultipleAccountsInfo([
      //   poolInfo.vaultA, 
      //   poolInfo.vaultB
      // ]);
      this.perfMonitor.markEnd('fetchTokenBalances');

      const result: any = {
        poolId: poolAddress.toString(),
        programId: poolAccountInfo.owner.toString(),
        tokenA: {
          mint: poolInfo.mintA.toString(),
          symbol: tokenAInfo.symbol,
          name: tokenAInfo.name,
          decimals: poolInfo.mintDecimalsA,
          vault: poolInfo.vaultA.toString(),
          //vaultBalance: vaultAInfo ? this.parseTokenBalance(vaultAInfo.data, poolInfo.mintDecimalsA) : 'Unknown',
        },
        
        tokenB: {
          mint: poolInfo.mintB.toString(),
          symbol: tokenBInfo.symbol,
          name: tokenBInfo.name,
          decimals: poolInfo.mintDecimalsB,
          vault: poolInfo.vaultB.toString(),
          //vaultBalance: vaultBInfo ? this.parseTokenBalance(vaultBInfo.data, poolInfo.mintDecimalsB) : 'Unknown',
        },

        price: {
          current: currentPrice.toString(),
          sqrtPriceX64: poolInfo.sqrtPriceX64.toString(),
          tickCurrent: poolInfo.tickCurrent,
        },
        startTime: poolInfo.startTime ? new Date(poolInfo.startTime.toNumber() * 1000).toISOString() : 'Unknown',
      };
      
      this.perfMonitor.markEnd('total');
      this.perfMonitor.end();
      result.performanceMetrics = {
        totalTime: this.perfMonitor.getExecutionTime(),
        markers: this.perfMonitor.getAllMarkers(),
      };
      
      return result;
    } catch (error) {
      console.error('获取池子基本信息时出错:', error);
      throw error;
    }
  }

  private parseTokenBalance(data: Buffer, decimals: number): string {
    try {
      const accountInfo = AccountLayout.decode(data);
      const balance = new BN(accountInfo.amount.toString());
      return new Decimal(balance.toString()).div(new Decimal(10).pow(decimals)).toString();
    } catch (error) {
      console.error('解析代币余额失败:', error);
      return 'Error parsing balance';
    }
  }

  private tickToPrice(tick: number, decimalsA: number, decimalsB: number): InstanceType<DecimalType> {
    const sqrtPriceX64 = SqrtPriceMath.getSqrtPriceX64FromTick(tick);
    return SqrtPriceMath.sqrtPriceX64ToPrice(sqrtPriceX64, decimalsA, decimalsB);
  }
}

async function main() {
  const poolId = process.argv[2];
  if (!poolId) {
    console.error('请提供 CLMM 池子地址作为参数');
    console.log('用法: npx ts-node clmm_pool_analyzer.ts <池子地址>');
    process.exit(1);
  }

  const analyzer = new ClmmPoolAnalyzer(RPC_ENDPOINT);
  
  try {
    console.log('正在获取池子基本信息...');
    const result = await analyzer.getPoolBasicInfo(poolId);
    console.log('\n===== 池子摘要 =====');
    console.log(`池子地址: ${result.poolId}`);
    console.log(`代币对: ${result.tokenA.symbol}/${result.tokenB.symbol}`);
    console.log(`当前价格: 1 ${result.tokenA.symbol} = ${result.price.current} ${result.tokenB.symbol}`);
    const fs = require('fs');
    const outputPath = `e:\\raydium_clmm_monitor\\raydium_clmm_sdk\\pool_${poolId}.json`;
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
    console.log(`\n基本信息已保存到: ${outputPath}`);
    
  } catch (error) {
    console.error('获取失败:', error);
    process.exit(1);
  }
}
main().catch(console.error);

module.exports = { ClmmPoolAnalyzer };