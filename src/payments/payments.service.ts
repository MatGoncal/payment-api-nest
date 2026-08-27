import { Injectable, NotFoundException } from '@nestjs/common';
import { Partner, Payment } from '@prisma/client';
import { PaymentStatus } from '../common/enums';
import { toMinorUnits } from '../common/utils/money.util';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { ListPaymentsQueryDto } from './dto/list-payments-query.dto';
import { FakePixProvider } from './fake-pix.provider';

export type PaymentResponse = {
  id: string;
  status: string;
  amount: number;
  currency: string;
  external_id: string | null;
  qr_code: string;
  copy_paste: string;
  expires_at: string;
  paid_at: string | null;
  created_at: string;
};

export type PaymentsListResponse = {
  data: PaymentResponse[];
  meta: {
    page: number;
    per_page: number;
    total: number;
    total_pages: number;
  };
};

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pixProvider: FakePixProvider,
  ) {}

  async create(
    partner: Partner,
    dto: CreatePaymentDto,
  ): Promise<PaymentResponse> {
    const paymentId = this.pixProvider.syntheticPaymentId();
    const expiresIn = dto.expires_in_seconds ?? 1800;
    const charge = this.pixProvider.createCharge(
      dto.amount,
      dto.currency,
      paymentId,
    );

    const payment = await this.prisma.payment.create({
      data: {
        id: paymentId,
        partnerId: partner.id,
        status: PaymentStatus.PENDING,
        amount: BigInt(dto.amount),
        currency: dto.currency.toUpperCase(),
        externalId: dto.external_id ?? null,
        description: dto.description ?? null,
        qrCode: charge.qr_code,
        copyPaste: charge.copy_paste,
        provider: charge.provider,
        expiresAt: new Date(Date.now() + expiresIn * 1000),
      },
    });

    return this.toResponse(payment);
  }

  async findForPartner(
    partner: Partner,
    paymentId: string,
  ): Promise<PaymentResponse> {
    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, partnerId: partner.id },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    return this.toResponse(payment);
  }

  async listForPartner(
    partner: Partner,
    query: ListPaymentsQueryDto,
  ): Promise<PaymentsListResponse> {
    const page = Math.max(1, query.page ?? 1);
    const perPage = Math.min(50, Math.max(1, query.per_page ?? 10));

    const where = {
      partnerId: partner.id,
      ...(query.status
        ? { status: query.status.toUpperCase() as PaymentStatus }
        : {}),
      ...(query.external_id
        ? { externalId: { contains: query.external_id } }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * perPage,
        take: perPage,
      }),
      this.prisma.payment.count({ where }),
    ]);

    return {
      data: items.map((payment) => this.toResponse(payment)),
      meta: {
        page,
        per_page: perPage,
        total,
        total_pages: Math.ceil(total / perPage) || 1,
      },
    };
  }

  toResponse(payment: Payment): PaymentResponse {
    return {
      id: payment.id,
      status: payment.status,
      amount: toMinorUnits(payment.amount),
      currency: payment.currency,
      external_id: payment.externalId,
      qr_code: payment.qrCode,
      copy_paste: payment.copyPaste,
      expires_at: payment.expiresAt.toISOString(),
      paid_at: payment.paidAt?.toISOString() ?? null,
      created_at: payment.createdAt.toISOString(),
    };
  }
}
