/**
 * Server-only adapter for the locally running IBKR Client Portal Gateway.
 * Live trading is intentionally unsupported. Never expose this relay publicly
 * without authentication, rate limits, account allowlists and audit logging.
 */
export class IbkrPaperAdapter {
  constructor({baseUrl='https://localhost:5000/v1/api',accountId,fetchImpl=fetch}={}){
    if(!accountId)throw new Error('IBKR paper accountId is required')
    this.baseUrl=baseUrl;this.accountId=accountId;this.fetch=fetchImpl
  }
  async request(path,options={}){
    const response=await this.fetch(this.baseUrl+path,{...options,headers:{'content-type':'application/json',...options.headers}})
    if(!response.ok)throw new Error(`IBKR ${response.status}: ${await response.text()}`)
    return response.json()
  }
  status(){return this.request('/iserver/auth/status')}
  accounts(){return this.request('/portfolio/accounts')}
  snapshot(conid,fields='31,84,86'){return this.request(`/iserver/marketdata/snapshot?conids=${conid}&fields=${fields}`)}
  async paperOrder(order,{riskApproved=false}={}){
    if(process.env.IBKR_ACCOUNT_MODE!=='paper')throw new Error('Hard lock: IBKR_ACCOUNT_MODE must equal paper')
    if(process.env.ENABLE_IBKR_PAPER_ORDERS!=='true')throw new Error('Hard lock: paper orders are disabled')
    if(!riskApproved)throw new Error('RiskGate rejected order')
    return this.request(`/iserver/account/${this.accountId}/orders`,{method:'POST',body:JSON.stringify({orders:[order]})})
  }
  liveOrder(){throw new Error('Live capital is not implemented in this project')}
}
